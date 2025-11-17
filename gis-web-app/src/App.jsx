import proj4 from 'proj4';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import getShapefile, { parseShp, parseDbf } from 'shpjs';
import LeftSidebar from './components/LeftSidebar';
import Map from './components/Map';
import RightSidebar from './components/RightSidebar';
import Toolbar from './components/Toolbar';
import BufferDialog from './components/BufferDialog';
import DrawTools from './components/DrawTools';
import StatisticsWindow from './components/StatisticsWindow';
import './App.css';

function App() {
    const [layers, setLayers] = useState([]);
    const [categories, setCategories] = useState({}); // Start with empty categories
    const [selectedColor, setSelectedColor] = useState('#3b82f6');
    const [showBufferDialog, setShowBufferDialog] = useState(false);
    const [map, setMap] = useState(null);
    const [selectedLayer, setSelectedLayer] = useState(null);
    const [activeTool, setTool] = useState('select');
    const layerGroupsRef = useRef({});
    const [showStatisticsWindow, setShowStatisticsWindow] = useState(false);
    
    // Sidebar widths state
    const [leftSidebarWidth, setLeftSidebarWidth] = useState(250);
    const [rightSidebarWidth, setRightSidebarWidth] = useState(380);
    const [isResizingLeft, setIsResizingLeft] = useState(false);
    const [isResizingRight, setIsResizingRight] = useState(false);

    useEffect(() => {
        if (!map) return;

        // Enable map dragging by default - users can always pan the map
        // Dragging will only be disabled when actively drawing (handled in DrawTools)
            map.dragging.enable();
    }, [map]);

    const [projection, setProjection] = useState('EPSG:22391');

    useEffect(() => {
        // Define the Carthage projection (Tunisia UTM Zone 32N)
        proj4.defs('EPSG:22391', '+proj=utm +zone=32 +north +ellps=clrk80ign +units=m +no_defs');
    }, []);

    // Helper function to validate and normalize GeoJSON
    const processGeoJSON = (geojson, fileNameWithoutExt, fileName) => {
        try {
            // Validate basic structure
            if (!geojson || typeof geojson !== 'object') {
                throw new Error('Invalid GeoJSON: must be an object');
            }

            let normalizedGeoJSON;

            // Handle different GeoJSON types
            if (geojson.type === 'FeatureCollection') {
                // Validate FeatureCollection
                if (!Array.isArray(geojson.features)) {
                    throw new Error('Invalid FeatureCollection: features must be an array');
                }
                
                // Normalize features
                normalizedGeoJSON = {
                    type: 'FeatureCollection',
                    features: geojson.features.map((feature, index) => {
                        if (!feature || feature.type !== 'Feature') {
                            console.warn(`Skipping invalid feature at index ${index}`);
                            return null;
                        }
                        if (!feature.geometry || !feature.geometry.coordinates) {
                            console.warn(`Skipping feature at index ${index}: missing geometry`);
                            return null;
                        }
                        return {
                            type: 'Feature',
                            geometry: feature.geometry,
                            properties: feature.properties || {}
                        };
                    }).filter(f => f !== null),
                    crs: geojson.crs || null
                };

                if (normalizedGeoJSON.features.length === 0) {
                    throw new Error('FeatureCollection contains no valid features');
                }

            } else if (geojson.type === 'Feature') {
                // Single Feature - wrap in FeatureCollection
                if (!geojson.geometry || !geojson.geometry.coordinates) {
                    throw new Error('Invalid Feature: missing geometry');
                }
                normalizedGeoJSON = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: geojson.geometry,
                        properties: geojson.properties || {}
                    }],
                    crs: geojson.crs || null
                };

            } else if (geojson.type && ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(geojson.type)) {
                // Geometry object - wrap in Feature and FeatureCollection
                normalizedGeoJSON = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: geojson,
                        properties: {}
                    }],
                    crs: geojson.crs || null
                };
            } else if (geojson.type === 'GeometryCollection') {
                // GeometryCollection - convert each geometry to a feature
                if (!Array.isArray(geojson.geometries)) {
                    throw new Error('Invalid GeometryCollection: geometries must be an array');
                }
                normalizedGeoJSON = {
                    type: 'FeatureCollection',
                    features: geojson.geometries
                        .filter(geom => geom && geom.coordinates)
                        .map(geometry => ({
                            type: 'Feature',
                            geometry: geometry,
                            properties: {}
                        })),
                    crs: geojson.crs || null
                };
                if (normalizedGeoJSON.features.length === 0) {
                    throw new Error('GeometryCollection contains no valid geometries');
                }

            } else {
                throw new Error(`Unsupported GeoJSON type: ${geojson.type || 'unknown'}. Expected FeatureCollection, Feature, or Geometry.`);
            }

            // Extract and transform coordinates if needed
            let sourceCRS = null;
            if (normalizedGeoJSON.crs) {
                const crs = normalizedGeoJSON.crs;
                if (crs.properties && crs.properties.name) {
                    const crsName = crs.properties.name;
                    console.log(`GeoJSON CRS detected: ${crsName}`);
                    
                    // Extract EPSG code from CRS name
                    // Handle formats like: "urn:ogc:def:crs:EPSG::32632" or "EPSG:32632"
                    const epsgMatch = crsName.match(/EPSG[:\s]*(\d+)/i);
                    if (epsgMatch) {
                        sourceCRS = `EPSG:${epsgMatch[1]}`;
                        console.log(`Extracted EPSG code: ${sourceCRS}`);
                    }
                }
            }

            // Transform coordinates if source CRS is not WGS84
            if (sourceCRS && sourceCRS !== 'EPSG:4326') {
                console.log(`Transforming coordinates from ${sourceCRS} to EPSG:4326`);
                
                // Define the source projection if not already defined
                if (!proj4.defs(sourceCRS)) {
                    // Try to get projection definition (common projections)
                    if (sourceCRS === 'EPSG:32632') {
                        proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs');
                    } else if (sourceCRS === 'EPSG:22391') {
                        proj4.defs('EPSG:22391', '+proj=utm +zone=32 +north +ellps=clrk80ign +units=m +no_defs');
                    } else {
                        console.warn(`Unknown CRS ${sourceCRS}. Attempting transformation anyway.`);
                    }
                }

                // First, check if properties have lon/lat (already in WGS84) - use those for Point geometries
                let usedProperties = false;
                normalizedGeoJSON.features.forEach((feature, index) => {
                    if (feature.geometry && feature.geometry.type === 'Point' && 
                        feature.properties && 
                        feature.properties.lon !== undefined && 
                        feature.properties.lat !== undefined) {
                        feature.geometry.coordinates = [
                            parseFloat(feature.properties.lon),
                            parseFloat(feature.properties.lat)
                        ];
                        usedProperties = true;
                    }
                });

                if (!usedProperties) {
                    // Transform coordinates for each feature using proj4
                    const transformCoordinates = (coords) => {
                        if (Array.isArray(coords[0])) {
                            // Nested array (LineString, Polygon, etc.)
                            return coords.map(transformCoordinates);
                        } else if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                            // Single coordinate pair [x, y] or [lon, lat]
                            try {
                                const [x, y, ...rest] = coords;
                                const [lon, lat] = proj4(sourceCRS, 'EPSG:4326', [x, y]);
                                return [lon, lat, ...rest];
                            } catch (error) {
                                console.error('Coordinate transformation error:', error, coords);
                                return coords; // Return original if transformation fails
                            }
                        }
                        return coords;
                    };

                    normalizedGeoJSON.features.forEach((feature, index) => {
                        if (feature.geometry && feature.geometry.coordinates) {
                            try {
                                feature.geometry.coordinates = transformCoordinates(feature.geometry.coordinates);
                            } catch (error) {
                                console.error(`Error transforming feature ${index}:`, error);
                            }
                        }
                    });
                } else {
                    console.log('Used lon/lat from properties for Point geometries');
                }

                // Remove CRS since coordinates are now in WGS84
                normalizedGeoJSON.crs = null;
                console.log('Coordinate transformation completed');
            } else if (!sourceCRS) {
                // Check if coordinates look like they're in a projected system (large numbers)
                const firstFeature = normalizedGeoJSON.features[0];
                if (firstFeature && firstFeature.geometry) {
                    const coords = firstFeature.geometry.coordinates;
                    if (coords && Array.isArray(coords)) {
                        const firstCoord = Array.isArray(coords[0]) ? coords[0][0] : coords[0];
                        if (typeof firstCoord === 'number' && Math.abs(firstCoord) > 180) {
                            console.warn('Coordinates appear to be in a projected system but no CRS specified. Attempting to use lon/lat from properties if available.');
                            
                            // Try to use lon/lat from properties if available
                            normalizedGeoJSON.features.forEach((feature, index) => {
                                if (feature.properties && feature.properties.lon !== undefined && feature.properties.lat !== undefined) {
                                    if (feature.geometry.type === 'Point') {
                                        feature.geometry.coordinates = [
                                            parseFloat(feature.properties.lon),
                                            parseFloat(feature.properties.lat)
                                        ];
                                        console.log(`Feature ${index}: Using lon/lat from properties`);
                                    }
                                }
                            });
                        }
                    }
                }
            }

            // Validate coordinate ranges for WGS84 (rough check)
            const validateCoordinates = (geometry, featureIndex) => {
                if (geometry.type === 'Point') {
                    const [lon, lat] = geometry.coordinates;
                    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                        console.warn(`Feature ${featureIndex} has coordinates outside WGS84 bounds: [${lon}, ${lat}]`);
                    }
                } else if (['LineString', 'MultiPoint'].includes(geometry.type)) {
                    geometry.coordinates.forEach((coord, coordIndex) => {
                        const [lon, lat] = coord;
                        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                            console.warn(`Feature ${featureIndex}, coordinate ${coordIndex} outside WGS84 bounds: [${lon}, ${lat}]`);
                        }
                    });
                } else if (['Polygon', 'MultiLineString'].includes(geometry.type)) {
                    geometry.coordinates.forEach((ring, ringIndex) => {
                        ring.forEach((coord, coordIndex) => {
                            const [lon, lat] = coord;
                            if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                                console.warn(`Feature ${featureIndex}, ring ${ringIndex}, coordinate ${coordIndex} outside WGS84 bounds: [${lon}, ${lat}]`);
                            }
                        });
                    });
                } else if (geometry.type === 'MultiPolygon') {
                    geometry.coordinates.forEach((polygon, polyIndex) => {
                        polygon.forEach((ring, ringIndex) => {
                            ring.forEach((coord, coordIndex) => {
                                const [lon, lat] = coord;
                                if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                                    console.warn(`Feature ${featureIndex}, polygon ${polyIndex}, ring ${ringIndex}, coordinate ${coordIndex} outside WGS84 bounds: [${lon}, ${lat}]`);
                                }
                            });
                        });
                    });
                } else if (geometry.type === 'GeometryCollection') {
                    geometry.geometries.forEach((geom, geomIndex) => {
                        validateCoordinates(geom, `${featureIndex}-${geomIndex}`);
                    });
                }
            };

            normalizedGeoJSON.features.forEach((feature, index) => {
                validateCoordinates(feature.geometry, index);
            });

            console.log('Processed GeoJSON:', normalizedGeoJSON);
            console.log(`GeoJSON contains ${normalizedGeoJSON.features.length} feature(s)`);
            
            addLayer(fileNameWithoutExt, 'geojson', normalizedGeoJSON, fileNameWithoutExt);
        } catch (error) {
            console.error('Error processing GeoJSON:', error);
            alert(`Error processing GeoJSON file ${fileName}:\n${error.message}\n\nPlease ensure the file is valid GeoJSON format.`);
        }
    };

    // Helper function to process CSV/Excel data to GeoJSON
    const processPointData = (data, fileNameWithoutExt) => {
        const features = data
            .filter(row => {
                // Check for X/Y columns (case insensitive)
                const xCol = Object.keys(row).find(key => key.toUpperCase() === 'X');
                const yCol = Object.keys(row).find(key => key.toUpperCase() === 'Y');
                return xCol && yCol && !isNaN(row[xCol]) && !isNaN(row[yCol]);
            })
                            .map(row => {
                                try {
                    const xCol = Object.keys(row).find(key => key.toUpperCase() === 'X');
                    const yCol = Object.keys(row).find(key => key.toUpperCase() === 'Y');
                    const x = parseFloat(row[xCol]);
                    const y = parseFloat(row[yCol]);
                                    
                                    const [lon, lat] = proj4('EPSG:22391', 'EPSG:4326', [x, y]);
                    
                    // Include all properties from the row
                    const properties = { ...row };
                    // Ensure name property exists
                    if (!properties.name) {
                        const nameCol = Object.keys(row).find(key => 
                            key.toUpperCase() === 'SITES' || 
                            key.toUpperCase() === 'A' || 
                            key.toUpperCase() === 'NAME'
                        );
                        properties.name = nameCol ? row[nameCol] : 'Unnamed';
                    }
                    properties.x = x;
                    properties.y = y;
                                    
                                    return {
                                        type: 'Feature',
                        properties: properties,
                                        geometry: {
                                            type: 'Point',
                                            coordinates: [lon, lat]
                                        }
                                    };
                                } catch (error) {
                                    console.error('Error converting coordinates:', row, error);
                                    return null;
                                }
                            })
                            .filter(feature => feature !== null);
                        
                        const geojson = {
                            type: 'FeatureCollection',
                            features: features
                        };
                        
                        console.log('Created GeoJSON:', geojson);
                        addLayer(fileNameWithoutExt, 'geojson', geojson, fileNameWithoutExt);
    };

    const handleFileUpload = (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Group shapefile components together
        const shapefileGroups = {};
        const otherFiles = [];

        for (const file of files) {
            const fileName = file.name;
            const ext = fileName.split('.').pop().toLowerCase();
            
            if (['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext)) {
                const baseName = fileName.replace(/\.(shp|shx|dbf|prj|cpg)$/i, '');
                if (!shapefileGroups[baseName]) {
                    shapefileGroups[baseName] = {};
                }
                shapefileGroups[baseName][ext] = file;
            } else {
                otherFiles.push(file);
            }
        }

        // Process shapefiles
        for (const [baseName, fileGroup] of Object.entries(shapefileGroups)) {
            if (fileGroup.shp) {
                processShapefile(fileGroup.shp, fileGroup, baseName);
            }
        }

        // Process other files
        for (const file of otherFiles) {
            const fileName = file.name;
            const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
            const ext = fileName.split('.').pop().toLowerCase();

            if (ext === 'csv') {
                Papa.parse(file, {
                    header: true,
                    delimiter: ';',
                    skipEmptyLines: true,
                    dynamicTyping: true,
                    complete: (results) => {
                        console.log('Parsed CSV data:', results.data);
                        processPointData(results.data, fileNameWithoutExt);
                    },
                    error: (error) => {
                        console.error('CSV parsing error:', error);
                        alert(`Error parsing CSV file ${fileName}: ${error.message}`);
                    }
                });
            } else if (ext === 'xlsx' || ext === 'xls') {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        
                        // Read the first sheet
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet);
                        
                        console.log('Parsed XLSX data:', jsonData);
                        processPointData(jsonData, fileNameWithoutExt);
                    } catch (error) {
                        console.error('Error parsing XLSX file:', error);
                        alert(`Error parsing XLSX file ${fileName}: ${error.message}`);
                    }
                };
                reader.readAsArrayBuffer(file);
            } else if (ext === 'geojson' || ext === 'json') {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const geojson = JSON.parse(e.target.result);
                        processGeoJSON(geojson, fileNameWithoutExt, fileName);
                    } catch (error) {
                        console.error('Error parsing file:', error);
                        alert(`Error parsing GeoJSON file ${fileName}: ${error.message}`);
                    }
                };
                reader.readAsText(file);
            }
        }
        event.target.value = '';
    };

    const processShapefile = async (shpFile, fileGroup, baseName) => {
        try {
            // Read the .shp file as ArrayBuffer
            const shpBuffer = await shpFile.arrayBuffer();
            
            // Try to read associated files if available
            let dbfBuffer = null;
            let prjBuffer = null;
            let cpgBuffer = null;
            
            if (fileGroup.dbf) {
                dbfBuffer = await fileGroup.dbf.arrayBuffer();
            }
            if (fileGroup.prj) {
                prjBuffer = await fileGroup.prj.text();
            }
            if (fileGroup.cpg) {
                cpgBuffer = await fileGroup.cpg.text();
            }

            // Use shpjs to parse the shapefile
            // shpjs getShapefile can work with an object containing .shp, .dbf, .prj, .cpg
            let geojson;
            try {
                const shapefileObject = {
                    shp: shpBuffer
                };
                
                if (dbfBuffer) {
                    shapefileObject.dbf = dbfBuffer;
                }
                if (prjBuffer) {
                    shapefileObject.prj = prjBuffer;
                }
                if (cpgBuffer) {
                    shapefileObject.cpg = cpgBuffer;
                }

                // Use getShapefile with object format
                geojson = await getShapefile(shapefileObject);
            } catch (parseError) {
                console.error('Shapefile parsing error:', parseError);
                // Fallback: try parsing shp and dbf separately if combine is needed
                try {
                    if (dbfBuffer) {
                        const shpFeatures = await parseShp(shpBuffer, prjBuffer);
                        const dbfData = await parseDbf(dbfBuffer, cpgBuffer);
                        // Combine features with attributes
                        geojson = {
                            type: 'FeatureCollection',
                            features: shpFeatures.map((feature, index) => ({
                                ...feature,
                                properties: {
                                    ...feature.properties,
                                    ...(dbfData[index] || {})
                                }
                            }))
                        };
                    } else {
                        geojson = await parseShp(shpBuffer, prjBuffer);
                    }
                } catch (fallbackError) {
                    throw new Error(`Failed to parse shapefile: ${parseError.message}`);
                }
            }

            // Ensure geojson has the correct structure
            if (!geojson || !geojson.type) {
                // If geojson is an array of features, wrap it
                if (Array.isArray(geojson)) {
                    geojson = {
                        type: 'FeatureCollection',
                        features: geojson
                    };
                } else if (geojson.type === 'Feature') {
                    geojson = {
                        type: 'FeatureCollection',
                        features: [geojson]
                    };
                }
            }

            // If we have a projection file, log it for reference
            if (prjBuffer) {
                console.log('Shapefile projection:', prjBuffer);
                // Note: Coordinate transformation is handled by shpjs if proj4 projection is provided
            }

            console.log('Parsed Shapefile:', geojson);
            addLayer(baseName, 'geojson', geojson, baseName);
        } catch (error) {
            console.error('Error parsing shapefile:', error);
            alert(`Error parsing shapefile ${baseName}: ${error.message}\n\nNote: Shapefiles work best with .shp, .shx, and .dbf files. Please select all related files when uploading.`);
        }
    };

    // Helper function to escape HTML to prevent XSS
    const escapeHtml = (text) => {
        if (text === null || text === undefined) return 'N/A';
        const div = document.createElement('div');
        div.textContent = text.toString();
        return div.innerHTML;
    };

    // Helper function to create styled popup content
    const createPopupContent = (properties) => {
        if (!properties || Object.keys(properties).length === 0) {
            return '<div class="popup-content">No attributes available</div>';
        }

        // Get name/title property
        const nameProp = properties.name || properties.Nom || properties.Sites || properties.A || 'Feature';
        
        // Filter out coordinate properties for cleaner display
        const displayProps = Object.entries(properties).filter(([key]) => {
            const lowerKey = key.toLowerCase();
            return lowerKey !== 'x' && lowerKey !== 'y' && lowerKey !== 'lon' && lowerKey !== 'lat';
        });

        let html = `
            <div class="popup-content">
                <div class="popup-header">
                    <h3 class="popup-title">
                        <i class="fas fa-map-marker-alt" style="margin-right: 8px; color: #ffffff;"></i>
                        ${escapeHtml(nameProp)}
                    </h3>
                </div>
                <div class="popup-body">
                    <table class="popup-attribute-table">
        `;

        displayProps.forEach(([key, value]) => {
            const displayValue = value !== null && value !== undefined ? value.toString() : 'N/A';
            html += `
                <tr>
                    <td class="popup-attr-key">${escapeHtml(key)}:</td>
                    <td class="popup-attr-value">${escapeHtml(displayValue)}</td>
                </tr>
            `;
        });

        html += `
                    </table>
                </div>
            </div>
        `;

        return html;
    };

    const addLayer = (name, type, data, category) => {
        const id = Date.now() + Math.random();
        const newLayer = {
            id,
            name,
            type,
            data,
            visible: true,
            color: selectedColor,
            category
        };

        // Add category if it doesn't exist
        if (!categories[category]) {
            setCategories(prevCategories => ({
                ...prevCategories,
                [category]: {
                    expanded: true
                }
            }));
        }

        setLayers(prevLayers => [...prevLayers, newLayer]);

        if (type === 'geojson' && map) {
            const geoLayer = L.geoJSON(data, {
                style: {
                    color: selectedColor,
                    weight: 2,
                    fillOpacity: 0.3
                },
                pointToLayer: (feature, latlng) => {
                    return L.circleMarker(latlng, {
                        radius: 6,
                        fillColor: selectedColor,
                        color: selectedColor,
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.6
                    });
                },
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        const popupContent = createPopupContent(feature.properties);
                        layer.bindPopup(popupContent, {
                            className: 'custom-popup',
                            maxWidth: 400,
                            maxHeight: 500
                        });
                    }
                }
            }).addTo(map);
            
            if (data.features && data.features.length > 0) {
                map.fitBounds(geoLayer.getBounds());
            }
            
            layerGroupsRef.current[id] = geoLayer;
        }
    };

    const toggleCategory = (name) => {
        setCategories(prevCategories => ({
            ...prevCategories,
            [name]: {
                ...prevCategories[name],
                expanded: !prevCategories[name].expanded
            }
        }));
    };

    const toggleLayerVisibility = (id) => {
        setLayers(prevLayers => prevLayers.map(layer => {
            if (layer.id === id) {
                const newVisibility = !layer.visible;
                const leafletLayer = layerGroupsRef.current[id];
                
                if (map && leafletLayer) {
                    if (newVisibility) {
                        map.addLayer(leafletLayer);
                    } else {
                        map.removeLayer(leafletLayer);
                    }
                }
                return { ...layer, visible: newVisibility };
            }
            return layer;
        }));
    };

    const changeLayerColor = (layerId, newColor) => {
        setLayers(prevLayers => prevLayers.map(layer => {
            if (layer.id === layerId) {
                const leafletLayer = layerGroupsRef.current[layerId];
                
                if (map && leafletLayer) {
                    // Update the style of the Leaflet layer
                    if (typeof leafletLayer.setStyle === 'function') {
                        leafletLayer.setStyle({
                            color: newColor,
                            fillColor: newColor
                        });
                    } else if (typeof leafletLayer.eachLayer === 'function') {
                        leafletLayer.eachLayer((subLayer) => {
                            if (typeof subLayer.setStyle === 'function') {
                                subLayer.setStyle({
                                    color: newColor,
                                    fillColor: newColor
                                });
                            }
                        });
                    }
                }
                
                return { ...layer, color: newColor };
            }
            return layer;
        }));
    };

    const handleColorSelection = (color) => {
        setSelectedColor(color);
        if (selectedLayer) {
            changeLayerColor(selectedLayer.id, color);
        }
    };

    const deleteLayer = (id) => {
        const leafletLayer = layerGroupsRef.current[id];
        if (map && leafletLayer) {
            map.removeLayer(leafletLayer);
            delete layerGroupsRef.current[id];
        }
        
        setLayers(prevLayers => {
            const remainingLayers = prevLayers.filter(layer => layer.id !== id);
            
            // Check if this was the last layer in its category
            const deletedLayer = prevLayers.find(layer => layer.id === id);
            if (deletedLayer) {
                const categoryHasOtherLayers = remainingLayers.some(
                    layer => layer.category === deletedLayer.category
                );
                
                // Remove category if no more layers in it
                if (!categoryHasOtherLayers) {
                    setCategories(prevCategories => {
                        const newCategories = { ...prevCategories };
                        delete newCategories[deletedLayer.category];
                        return newCategories;
                    });
                }
            }
            
            return remainingLayers;
        });
    };

    const selectLayer = (layer) => {
        setSelectedLayer(layer);
    };

    const runBufferAnalysis = () => {
        const type = document.getElementById('bufferType').value;
        const radius = document.getElementById('bufferRadius').value;
        console.log('Running buffer analysis:', type, radius);
        setShowBufferDialog(false);
    };

    const zoomIn = () => {
        if (map) {
            map.zoomIn();
        }
    };

    const zoomOut = () => {
        if (map) {
            map.zoomOut();
        }
    };

    // Resize handlers
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isResizingLeft) {
                const newWidth = e.clientX;
                if (newWidth >= 200 && newWidth <= 600) {
                    setLeftSidebarWidth(newWidth);
                }
            }
            if (isResizingRight) {
                const newWidth = window.innerWidth - e.clientX;
                if (newWidth >= 200 && newWidth <= 600) {
                    setRightSidebarWidth(newWidth);
                }
            }
        };

        const handleMouseUp = () => {
            setIsResizingLeft(false);
            setIsResizingRight(false);
        };

        if (isResizingLeft || isResizingRight) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizingLeft, isResizingRight]);

    const handleLeftResizeStart = (e) => {
        e.preventDefault();
        setIsResizingLeft(true);
    };

    const handleRightResizeStart = (e) => {
        e.preventDefault();
        setIsResizingRight(true);
    };

    return (
        <div className={`app-container ${isResizingLeft || isResizingRight ? 'resizing' : ''}`}>
            <input 
                type="file" 
                id="fileInput" 
                style={{ display: 'none' }} 
                multiple 
                accept=".csv,.geojson,.json,.xlsx,.xls,.shp,.shx,.dbf,.prj,.cpg"
                onChange={handleFileUpload}
            />
            <div className="left-sidebar-wrapper" style={{ width: `${leftSidebarWidth}px` }}>
            <LeftSidebar
                layers={layers}
                categories={categories}
                toggleCategory={toggleCategory}
                toggleLayerVisibility={toggleLayerVisibility}
                deleteLayer={deleteLayer}
                selectLayer={selectLayer}
                selectedLayer={selectedLayer}
            />
                <div 
                    className="resize-handle resize-handle-right"
                    onMouseDown={handleLeftResizeStart}
                ></div>
            </div>
            <div className="map-container">
                <Map setMap={setMap} />
                <Toolbar showBufferDialog={() => setShowBufferDialog(true)} />
                <DrawTools map={map} activeTool={activeTool} setTool={setTool} />
            </div>
            <div className="right-sidebar-wrapper" style={{ width: `${rightSidebarWidth}px` }}>
                <div 
                    className="resize-handle resize-handle-left"
                    onMouseDown={handleRightResizeStart}
                ></div>
            <RightSidebar
                selectedColor={selectedColor}
                selectColor={handleColorSelection}
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                setTool={setTool}
                activeTool={activeTool}
                selectedLayer={selectedLayer}
                projection={projection}
                layerGroupsRef={layerGroupsRef}
                map={map}
                    onShowStatistics={() => setShowStatisticsWindow(true)}
            />
            </div>
            <BufferDialog
                show={showBufferDialog}
                closeBufferDialog={() => setShowBufferDialog(false)}
                runBufferAnalysis={runBufferAnalysis}
            />
            {showStatisticsWindow && selectedLayer && (
                <StatisticsWindow
                    layer={selectedLayer}
                    onClose={() => setShowStatisticsWindow(false)}
                />
            )}
        </div>
    );
}

export default App;