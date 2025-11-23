import proj4 from 'proj4';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import getShapefile, { parseShp, parseDbf } from 'shpjs';
import toGeoJSON from '@mapbox/togeojson';
import { pointInLayerPolygons } from './utils/dataFunctions';
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
    const highlightLayersRef = useRef({}); // For yellow highlighted points
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
        // Define common projections
        // Tunisia UTM Zone 32N (Carthage)
        proj4.defs('EPSG:22391', '+proj=utm +zone=32 +north +ellps=clrk80ign +units=m +no_defs');
        // WGS84 UTM Zone 32N
        proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs');
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

    // Manual Windows-1252 to UTF-8 conversion for browsers that don't support it
    // Complete Windows-1252 character mapping using Unicode escape sequences
    const convertWindows1252ToUTF8 = (bytes) => {
        // Windows-1252 to Unicode mapping (complete character set)
        const windows1252Map = {
            // Lowercase accented characters
            0xE0: '\u00E0', // à
            0xE1: '\u00E1', // á
            0xE2: '\u00E2', // â
            0xE3: '\u00E3', // ã
            0xE4: '\u00E4', // ä
            0xE5: '\u00E5', // å
            0xE6: '\u00E6', // æ
            0xE7: '\u00E7', // ç
            0xE8: '\u00E8', // è
            0xE9: '\u00E9', // é
            0xEA: '\u00EA', // ê
            0xEB: '\u00EB', // ë
            0xEC: '\u00EC', // ì
            0xED: '\u00ED', // í
            0xEE: '\u00EE', // î
            0xEF: '\u00EF', // ï
            0xF0: '\u00F0', // ð
            0xF1: '\u00F1', // ñ
            0xF2: '\u00F2', // ò
            0xF3: '\u00F3', // ó
            0xF4: '\u00F4', // ô
            0xF5: '\u00F5', // õ
            0xF6: '\u00F6', // ö
            0xF8: '\u00F8', // ø
            0xF9: '\u00F9', // ù
            0xFA: '\u00FA', // ú
            0xFB: '\u00FB', // û
            0xFC: '\u00FC', // ü
            0xFD: '\u00FD', // ý
            0xFE: '\u00FE', // þ
            0xFF: '\u00FF', // ÿ
            
            // Uppercase accented characters
            0xC0: '\u00C0', // À
            0xC1: '\u00C1', // Á
            0xC2: '\u00C2', // Â
            0xC3: '\u00C3', // Ã
            0xC4: '\u00C4', // Ä
            0xC5: '\u00C5', // Å
            0xC6: '\u00C6', // Æ
            0xC7: '\u00C7', // Ç
            0xC8: '\u00C8', // È
            0xC9: '\u00C9', // É
            0xCA: '\u00CA', // Ê
            0xCB: '\u00CB', // Ë
            0xCC: '\u00CC', // Ì
            0xCD: '\u00CD', // Í
            0xCE: '\u00CE', // Î
            0xCF: '\u00CF', // Ï
            0xD0: '\u00D0', // Ð
            0xD1: '\u00D1', // Ñ
            0xD2: '\u00D2', // Ò
            0xD3: '\u00D3', // Ó
            0xD4: '\u00D4', // Ô
            0xD5: '\u00D5', // Õ
            0xD6: '\u00D6', // Ö
            0xD8: '\u00D8', // Ø
            0xD9: '\u00D9', // Ù
            0xDA: '\u00DA', // Ú
            0xDB: '\u00DB', // Û
            0xDC: '\u00DC', // Ü
            0xDD: '\u00DD', // Ý
            0xDE: '\u00DE', // Þ
            
            // Special Windows-1252 characters (0x80-0x9F)
            0x80: '\u20AC', // €
            0x82: '\u201A', // ‚
            0x83: '\u0192', // ƒ
            0x84: '\u201E', // „
            0x85: '\u2026', // …
            0x86: '\u2020', // †
            0x87: '\u2021', // ‡
            0x88: '\u02C6', // ˆ
            0x89: '\u2030', // ‰
            0x8A: '\u0160', // Š
            0x8B: '\u2039', // ‹
            0x8C: '\u0152', // Œ
            0x8E: '\u017D', // Ž
            0x91: '\u2018', // '
            0x92: '\u2019', // '
            0x93: '\u201C', // "
            0x94: '\u201D', // "
            0x95: '\u2022', // •
            0x96: '\u2013', // –
            0x97: '\u2014', // —
            0x98: '\u02DC', // ˜
            0x99: '\u2122', // ™
            0x9A: '\u0161', // š
            0x9B: '\u203A', // ›
            0x9C: '\u0153', // œ
            0x9E: '\u017E', // ž
            0x9F: '\u0178'  // Ÿ
        };
        
        let result = '';
        for (let i = 0; i < bytes.length; i++) {
            const byte = bytes[i];
            if (windows1252Map[byte]) {
                result += windows1252Map[byte];
            } else if (byte >= 0x20 && byte < 0x7F) {
                // ASCII printable characters
                result += String.fromCharCode(byte);
            } else if (byte === 0x0A || byte === 0x0D || byte === 0x09) {
                // Line breaks and tabs
                result += String.fromCharCode(byte);
            } else if (byte < 0x20) {
                // Control characters (preserve)
                result += String.fromCharCode(byte);
            } else {
                // Unknown byte - try to preserve as-is
                result += String.fromCharCode(byte);
            }
        }
        return result;
    };

    // Helper function to convert text from various encodings to UTF-8
    const convertToUTF8 = async (file, encodings = ['UTF-8', 'Windows-1252', 'ISO-8859-1', 'ISO-8859-15']) => {
        // Read file as ArrayBuffer first for encoding detection
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Try each encoding
        for (const encoding of encodings) {
            try {
                let decoded;
                
                if (encoding === 'UTF-8') {
                    // For UTF-8, try FileReader method first (most reliable)
                    try {
                        decoded = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = (e) => resolve(e.target.result);
                            reader.onerror = reject;
                            reader.readAsText(file, 'UTF-8');
                        });
                    } catch (error) {
                        // Fallback to TextDecoder
                        const decoder = new TextDecoder('UTF-8', { fatal: false });
                        decoded = decoder.decode(arrayBuffer);
                    }
                } else if (encoding === 'Windows-1252') {
                    // Try TextDecoder first
                    try {
                        const decoder = new TextDecoder('windows-1252', { fatal: false });
                        decoded = decoder.decode(arrayBuffer);
                    } catch (error) {
                        // Fallback to manual conversion
                        console.log('TextDecoder does not support Windows-1252, using manual conversion');
                        decoded = convertWindows1252ToUTF8(uint8Array);
                    }
                } else {
                    // For other encodings, use TextDecoder
                    const decoder = new TextDecoder(encoding, { fatal: false });
                    decoded = decoder.decode(arrayBuffer);
                }
                
                // Check if decoding produced valid text
                if (decoded && decoded.length > 0) {
                    // Check for replacement characters (indicates decoding failure)
                    const replacementCharCount = (decoded.match(/\uFFFD/g) || []).length;
                    const questionMarkCount = (decoded.match(/\?/g) || []).length;
                    const totalChars = decoded.length;
                    
                    // Check for special characters to verify correct decoding
                    const hasSpecialChars = /[éèêëàâäôöùûüçÉÈÊËÀÂÄÔÖÙÛÜÇ]/.test(decoded) || /[\u0600-\u06FF]/.test(decoded);
                    
                    // If we find special characters and few replacement/question marks, encoding is likely correct
                    if (hasSpecialChars && (replacementCharCount / totalChars < 0.01) && (questionMarkCount / totalChars < 0.1)) {
                        console.log(`✓ File successfully decoded as ${encoding}`);
                        console.log(`  Sample with special chars:`, decoded.match(/[éèêëàâäôöùûüçÉÈÊËÀÂÄÔÖÙÛÜÇ\u0600-\u06FF]{0,20}/)?.[0]);
                        return decoded;
                    }
                    
                    // If no replacement chars and no excessive question marks, might be correct
                    if (replacementCharCount === 0 && (questionMarkCount / totalChars < 0.05) && encoding === 'UTF-8') {
                        console.log(`✓ File read as ${encoding}`);
                        return decoded;
                    }
                }
            } catch (error) {
                console.warn(`Failed to decode as ${encoding}:`, error);
                continue;
            }
        }
        
        // Last resort: try manual Windows-1252 conversion
        console.warn('Standard encoding attempts failed, trying manual Windows-1252 conversion');
        const manualConverted = convertWindows1252ToUTF8(uint8Array);
        if (manualConverted && manualConverted.length > 0) {
            console.log('✓ Used manual Windows-1252 conversion');
            return manualConverted;
        }
        
        // Final fallback: UTF-8 with FileReader
        console.warn('All encoding attempts failed, using UTF-8 fallback');
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
        });
    };

    // Helper function to ensure UTF-8 string preservation
    const preserveUTF8 = (value) => {
        if (value === null || value === undefined) return '';
        // Ensure the value is treated as a UTF-8 string
        if (typeof value === 'string') {
            return value;
        }
        // Convert to string, preserving UTF-8 encoding
        return String(value);
    };

    // Helper function to process CSV/Excel data to GeoJSON
    const processPointData = (data, fileNameWithoutExt) => {
        const features = data
            .filter(row => {
                // Check for X/Y columns (case insensitive)
                const xCol = Object.keys(row).find(key => key.toUpperCase() === 'X');
                const yCol = Object.keys(row).find(key => key.toUpperCase() === 'Y');
                return xCol && yCol && !isNaN(parseFloat(row[xCol])) && !isNaN(parseFloat(row[yCol]));
            })
            .map(row => {
                try {
                    const xCol = Object.keys(row).find(key => key.toUpperCase() === 'X');
                    const yCol = Object.keys(row).find(key => key.toUpperCase() === 'Y');
                    const x = parseFloat(row[xCol]);
                    const y = parseFloat(row[yCol]);
                    
                    const [lon, lat] = proj4('EPSG:22391', 'EPSG:4326', [x, y]);
                    
                    // Include all properties from the row, preserving UTF-8 characters
                    const properties = {};
                    // Copy all properties, ensuring strings are preserved as-is to maintain UTF-8
                    Object.keys(row).forEach(key => {
                        const value = row[key];
                        // Preserve the value as-is to maintain UTF-8 encoding
                        properties[key] = preserveUTF8(value);
                    });
                    
                    // Ensure name property exists
                    if (!properties.name) {
                        const nameCol = Object.keys(row).find(key => 
                            key.toUpperCase() === 'SITES' || 
                            key.toUpperCase() === 'A' || 
                            key.toUpperCase() === 'NAME'
                        );
                        properties.name = nameCol ? preserveUTF8(row[nameCol]) : 'Unnamed';
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
            
            // Group shapefile components together
            if (['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext)) {
                // Remove extension to get base name (case-insensitive)
                const baseName = fileName.replace(/\.(shp|shx|dbf|prj|cpg)$/i, '');
                console.log(`Grouping shapefile component: ${fileName} -> baseName: "${baseName}", ext: "${ext}"`);
                
                if (!shapefileGroups[baseName]) {
                    shapefileGroups[baseName] = {};
                }
                shapefileGroups[baseName][ext] = file;
            } else {
                otherFiles.push(file);
            }
        }

        // Log grouped files
        console.log('Shapefile groups:', Object.keys(shapefileGroups));
        for (const [baseName, fileGroup] of Object.entries(shapefileGroups)) {
            console.log(`  ${baseName}:`, Object.keys(fileGroup));
        }

        // Process shapefiles
        for (const [baseName, fileGroup] of Object.entries(shapefileGroups)) {
            if (fileGroup.shp) {
                console.log(`Processing shapefile: ${baseName} with files:`, Object.keys(fileGroup));
                processShapefile(fileGroup.shp, fileGroup, baseName);
            } else {
                console.warn(`Shapefile group "${baseName}" has no .shp file, skipping. Available files:`, Object.keys(fileGroup));
            }
        }

        // Process other files
        for (const file of otherFiles) {
            const fileName = file.name;
            const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
            const ext = fileName.split('.').pop().toLowerCase();

            if (ext === 'csv') {
                // Read CSV with automatic encoding detection and conversion
                (async () => {
                    try {
                        // Try to detect and convert encoding
                        let csvText = await convertToUTF8(file);
                        
                        // Remove BOM (Byte Order Mark) if present
                        if (csvText.charCodeAt(0) === 0xFEFF) {
                            csvText = csvText.slice(1);
                            console.log('Removed BOM from CSV file');
                        }
                        
                        // Log sample to verify encoding
                        if (csvText.length > 0) {
                            const sample = csvText.substring(0, Math.min(200, csvText.length));
                            console.log('CSV sample (first 200 chars):', sample);
                            // Check for French/Arabic characters
                            if (/[éèêëàâäôöùûüçÉÈÊËÀÂÄÔÖÙÛÜÇ]/.test(sample) || /[\u0600-\u06FF]/.test(sample)) {
                                console.log('✓ Special characters detected in CSV:', sample.match(/[éèêëàâäôöùûüçÉÈÊËÀÂÄÔÖÙÛÜÇ\u0600-\u06FF]/g));
                            } else {
                                console.warn('⚠ No special characters detected - file might be ASCII or encoding issue');
                            }
                        }
                        
                        Papa.parse(csvText, {
                            header: true,
                            delimiter: ';',
                            skipEmptyLines: true,
                            dynamicTyping: false, // Keep as strings to preserve special characters
                            complete: (results) => {
                                console.log('Parsed CSV data:', results.data);
                                // Verify special characters in parsed data
                                if (results.data.length > 0) {
                                    const firstRow = results.data[0];
                                    const sampleValue = Object.values(firstRow).find(v => typeof v === 'string' && v.length > 0);
                                    if (sampleValue) {
                                        console.log('Sample value from CSV:', sampleValue);
                                        if (/[éèêëàâäôöùûüçÉÈÊËÀÂÄÔÖÙÛÜÇ]/.test(sampleValue) || /[\u0600-\u06FF]/.test(sampleValue)) {
                                            console.log('✓ Special characters preserved in parsed data:', sampleValue);
                                        }
                                    }
                                }
                                processPointData(results.data, fileNameWithoutExt);
                            },
                            error: (error) => {
                                console.error('CSV parsing error:', error);
                                alert(`Error parsing CSV file ${fileName}: ${error.message}`);
                            }
                        });
                    } catch (error) {
                        console.error('Error reading CSV file:', error);
                        alert(`Error reading CSV file ${fileName}: ${error.message}`);
                    }
                })();
            } else if (ext === 'xlsx' || ext === 'xls') {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        // XLSX library handles UTF-8 encoding automatically
                        const workbook = XLSX.read(data, { 
                            type: 'array',
                            cellText: false,
                            cellDates: true,
                            codepage: 65001 // UTF-8 code page
                        });
                        
                        // Read the first sheet
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        // Use raw: false to get formatted text values, preserving UTF-8
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                            raw: false, // Get formatted strings to preserve UTF-8
                            defval: '',
                            blankrows: false
                        });
                        
                        console.log('Parsed XLSX data:', jsonData);
                        processPointData(jsonData, fileNameWithoutExt);
                    } catch (error) {
                        console.error('Error parsing XLSX file:', error);
                        alert(`Error parsing XLSX file ${fileName}: ${error.message}`);
                    }
                };
                reader.readAsArrayBuffer(file);
            } else if (ext === 'geojson' || ext === 'json') {
                // Read JSON with automatic encoding detection
                (async () => {
                    try {
                        const jsonText = await convertToUTF8(file);
                        const geojson = JSON.parse(jsonText);
                        processGeoJSON(geojson, fileNameWithoutExt, fileName);
                    } catch (error) {
                        console.error('Error parsing file:', error);
                        alert(`Error parsing GeoJSON file ${fileName}: ${error.message}`);
                    }
                })();
            } else if (ext === 'kml') {
                // Read KML with automatic encoding detection
                (async () => {
                    try {
                        let kmlText = await convertToUTF8(file);
                        
                        // Fix common KML namespace issues
                        // Add missing xsi namespace if schemaLocation is used but xsi is not defined
                        if (kmlText.includes('schemaLocation') && !kmlText.includes('xmlns:xsi')) {
                            // Try to find the root element and add xsi namespace
                            kmlText = kmlText.replace(
                                /<kml([^>]*)>/i,
                                '<kml$1 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
                            );
                        }
                        
                        // Also ensure standard KML namespace is present
                        if (!kmlText.includes('xmlns=') && !kmlText.includes('xmlns:')) {
                            kmlText = kmlText.replace(
                                /<kml([^>]*)>/i,
                                '<kml$1 xmlns="http://www.opengis.net/kml/2.2">'
                            );
                        } else if (kmlText.includes('<kml') && !kmlText.includes('xmlns="http://www.opengis.net/kml/2.2"') && !kmlText.includes("xmlns='http://www.opengis.net/kml/2.2'")) {
                            // Add KML namespace if missing
                            kmlText = kmlText.replace(
                                /<kml([^>]*)>/i,
                                '<kml$1 xmlns="http://www.opengis.net/kml/2.2">'
                            );
                        }
                        
                        // Use browser's native DOMParser (works better with @mapbox/togeojson)
                        const parser = new window.DOMParser();
                        const kml = parser.parseFromString(kmlText, 'text/xml');
                        
                        // Check for parsing errors
                        const parserError = kml.getElementsByTagName('parsererror')[0];
                        if (parserError) {
                            // Try to extract a cleaner error message
                            let errorText = '';
                            const errorContent = parserError.textContent || parserError.innerText || '';
                            
                            // Extract just the error message, not the full page rendering
                            const errorMatch = errorContent.match(/error on line \d+ at column \d+:(.+?)(?:\n|$)/);
                            if (errorMatch) {
                                errorText = errorMatch[1].trim();
                            } else {
                                errorText = errorContent.split('\n')[0] || 'Unknown XML parsing error';
                            }
                            
                            throw new Error('Invalid XML format: ' + errorText);
                        }
                        
                        // Convert KML to GeoJSON
                        const geojson = toGeoJSON.kml(kml);
                        
                        if (!geojson || !geojson.features || geojson.features.length === 0) {
                            alert(`KML file ${fileName} contains no features.`);
                            return;
                        }
                        
                        // KML files often have extended data in properties, preserve it
                        const placemarks = kml.getElementsByTagName('Placemark');
                        geojson.features.forEach((feature, index) => {
                            // Ensure properties object exists
                            if (!feature.properties) {
                                feature.properties = {};
                            }
                            
                            // Try to extract additional properties from KML Placemark
                            if (placemarks[index]) {
                                const placemark = placemarks[index];
                                
                                // Extract ExtendedData
                                const extendedData = placemark.getElementsByTagName('ExtendedData')[0];
                                if (extendedData) {
                                    const dataElements = extendedData.getElementsByTagName('Data');
                                    for (let i = 0; i < dataElements.length; i++) {
                                        const dataEl = dataElements[i];
                                        const name = dataEl.getAttribute('name');
                                        const valueEl = dataEl.getElementsByTagName('value')[0];
                                        if (name && valueEl) {
                                            const value = valueEl.textContent || valueEl.text || '';
                                            feature.properties[name] = value.trim();
                                        }
                                    }
                                }
                                
                                // Extract Style/PolyStyle information for fill and fill-opacity
                                // Check for Style element first
                                let styleElement = placemark.getElementsByTagName('Style')[0];
                                if (!styleElement) {
                                    // Check for styleUrl reference
                                    const styleUrlEl = placemark.getElementsByTagName('styleUrl')[0];
                                    if (styleUrlEl) {
                                        const styleUrl = styleUrlEl.textContent || styleUrlEl.text || '';
                                        // Try to find the referenced style (format: #styleId)
                                        if (styleUrl.startsWith('#')) {
                                            const styleId = styleUrl.substring(1);
                                            // Search for Style with matching id in the document
                                            const allStyles = kml.getElementsByTagName('Style');
                                            for (let i = 0; i < allStyles.length; i++) {
                                                if (allStyles[i].getAttribute('id') === styleId) {
                                                    styleElement = allStyles[i];
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // Extract fill color from PolyStyle
                                if (styleElement) {
                                    const polyStyle = styleElement.getElementsByTagName('PolyStyle')[0];
                                    if (polyStyle) {
                                        const colorEl = polyStyle.getElementsByTagName('color')[0];
                                        const fillEl = polyStyle.getElementsByTagName('fill')[0];
                                        const fillOpacityEl = polyStyle.getElementsByTagName('fillOpacity')[0];
                                        
                                        // Extract fill color
                                        if (colorEl) {
                                            const kmlColor = (colorEl.textContent || colorEl.text || '').trim();
                                            if (kmlColor) {
                                                const hexColor = convertKMLColorToHex(kmlColor);
                                                if (hexColor) {
                                                    feature.properties.fill = hexColor;
                                                }
                                            }
                                        }
                                        
                                        // Extract fill (if explicitly set)
                                        if (fillEl) {
                                            const fillValue = (fillEl.textContent || fillEl.text || '').trim();
                                            if (fillValue !== '') {
                                                feature.properties.fill = fillValue;
                                            }
                                        }
                                        
                                        // Extract fill-opacity
                                        if (fillOpacityEl) {
                                            const opacityValue = (fillOpacityEl.textContent || fillOpacityEl.text || '').trim();
                                            if (opacityValue !== '') {
                                                feature.properties['fill-opacity'] = opacityValue;
                                            }
                                        } else if (colorEl) {
                                            // KML color format includes alpha in first 2 hex digits
                                            const kmlColor = (colorEl.textContent || colorEl.text || '').trim();
                                            if (kmlColor && /^[0-9a-fA-F]{8}$/.test(kmlColor)) {
                                                const alphaHex = kmlColor.substring(0, 2);
                                                const alpha = parseInt(alphaHex, 16) / 255;
                                                feature.properties['fill-opacity'] = alpha.toString();
                                            }
                                        }
                                    }
                                    
                                    // Also check IconStyle for point features
                                    const iconStyle = styleElement.getElementsByTagName('IconStyle')[0];
                                    if (iconStyle) {
                                        const colorEl = iconStyle.getElementsByTagName('color')[0];
                                        if (colorEl && !feature.properties.fill) {
                                            const kmlColor = (colorEl.textContent || colorEl.text || '').trim();
                                            if (kmlColor) {
                                                const hexColor = convertKMLColorToHex(kmlColor);
                                                if (hexColor) {
                                                    feature.properties.fill = hexColor;
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // Extract name and description
                                const nameEl = placemark.getElementsByTagName('name')[0];
                                const descEl = placemark.getElementsByTagName('description')[0];
                                
                                if (nameEl) {
                                    const nameValue = nameEl.textContent || nameEl.text || '';
                                    if (nameValue.trim() && !feature.properties.name) {
                                        feature.properties.name = nameValue.trim();
                                    }
                                }
                                if (descEl) {
                                    const descValue = descEl.textContent || descEl.text || '';
                                    if (descValue.trim() && !feature.properties.description) {
                                        feature.properties.description = descValue.trim();
                                    }
                                }
                            }
                        });
                        
                        console.log('Converted KML to GeoJSON:', geojson);
                        processGeoJSON(geojson, fileNameWithoutExt, fileName);
                    } catch (error) {
                        console.error('Error parsing KML file:', error);
                        alert(`Error parsing KML file ${fileName}: ${error.message}\n\nPlease ensure the file is a valid KML format.`);
                    }
                })();
            }
        }
        event.target.value = '';
    };

    // Helper function to extract EPSG code from PRJ file content
    const extractEPSGFromPRJ = (prjText) => {
        if (!prjText) {
            console.log('extractEPSGFromPRJ: prjText is null or empty');
            return null;
        }
        
        // Normalize the text (remove extra whitespace, convert to uppercase for matching)
        const normalizedText = prjText.trim().replace(/\s+/g, ' ');
        console.log('PRJ normalized text (first 200 chars):', normalizedText.substring(0, 200));
        
        // Try to find EPSG code in PRJ text
        // Common patterns: "EPSG:32632", "EPSG::32632", "AUTHORITY["EPSG","32632"]"
        const epsgMatch = prjText.match(/EPSG[:\s]*(\d+)/i) || 
                         prjText.match(/AUTHORITY\["EPSG","(\d+)"\]/i);
        
        if (epsgMatch) {
            const epsgCode = `EPSG:${epsgMatch[1]}`;
            console.log(`Found explicit EPSG code: ${epsgCode}`);
            return epsgCode;
        }
        
        // Try to detect common projections from WKT (Well-Known Text)
        // First, check for the specific pattern we know: "WGS_1984_UTM_Zone_32N"
        if (prjText.includes('WGS_1984_UTM_Zone_32N') || prjText.includes('WGS 1984 UTM Zone 32N')) {
            console.log('Detected WGS_1984_UTM_Zone_32N pattern, returning EPSG:32632');
            return 'EPSG:32632';
        }
        
        // Check for UTM Zone 32 (various formats)
        const hasUTM = prjText.includes('UTM') || prjText.includes('utm');
        const hasZone32 = prjText.includes('Zone_32') || prjText.includes('Zone 32') || 
                          prjText.includes('zone_32') || prjText.includes('zone 32') ||
                          prjText.includes('ZONE_32') || prjText.includes('ZONE 32') ||
                          prjText.match(/Zone[_\s]*32/i);
        
        if (hasUTM && hasZone32) {
            console.log('Detected UTM Zone 32 in PRJ file');
            // Check for WGS84 (various formats) - be more comprehensive
            const hasWGS = prjText.includes('WGS_1984') || prjText.includes('WGS 1984') || 
                          prjText.includes('WGS84') || prjText.includes('WGS 84') ||
                          prjText.includes('GCS_WGS_1984') || prjText.includes('GCS_WGS') ||
                          prjText.includes('GCS_WGS84') || prjText.includes('GCS WGS') ||
                          prjText.includes('D_WGS_1984') || prjText.includes('Datum_WGS_1984') ||
                          prjText.includes('DATUM["D_WGS_1984"') || prjText.includes('DATUM["WGS_1984"') ||
                          prjText.includes('PROJCS["WGS') || prjText.match(/WGS/i);
            
            if (hasWGS) {
                console.log('Detected WGS84 in PRJ file, returning EPSG:32632');
                return 'EPSG:32632'; // WGS84 UTM Zone 32N
            }
            
            // Check for Tunisia/Carthage
            const hasCarthage = prjText.includes('Carthage') || prjText.includes('CARTHAGE') ||
                               prjText.includes('clrk80') || prjText.includes('CLRK80') ||
                               prjText.includes('Clarke_1880') || prjText.includes('Clarke 1880') ||
                               prjText.includes('CLARKE_1880');
            
            if (hasCarthage) {
                console.log('Detected Carthage/Tunisia projection in PRJ file, returning EPSG:22391');
                return 'EPSG:22391'; // Tunisia UTM Zone 32N
            }
        }
        
        // Try to detect other UTM zones with WGS84 (more flexible pattern)
        const utmZoneMatch = prjText.match(/UTM[_\s]*Zone[_\s]*(\d+)/i) || 
                            prjText.match(/zone[_\s]*(\d+)/i);
        if (utmZoneMatch && (prjText.includes('WGS') || prjText.includes('GCS_WGS'))) {
            const zone = parseInt(utmZoneMatch[1]);
            // Determine if Northern or Southern hemisphere
            const isNorth = !prjText.includes('South') && !prjText.includes('S') && 
                           !prjText.includes('south') && !prjText.includes('s');
            const epsgCode = isNorth ? 32600 + zone : 32700 + zone;
            console.log(`Detected UTM Zone ${zone}${isNorth ? 'N' : 'S'}, using EPSG:${epsgCode}`);
            return `EPSG:${epsgCode}`;
        }
        
        console.log('Could not extract EPSG code from PRJ file');
        return null;
    };

    // Helper function to transform coordinates in GeoJSON
    const transformGeoJSONCoordinates = (geojson, sourceCRS) => {
        if (!sourceCRS || sourceCRS === 'EPSG:4326') {
            return geojson; // Already in WGS84
        }

        // Define the source projection if not already defined
        if (!proj4.defs(sourceCRS)) {
            if (sourceCRS === 'EPSG:32632') {
                proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs');
            } else if (sourceCRS === 'EPSG:22391') {
                proj4.defs('EPSG:22391', '+proj=utm +zone=32 +north +ellps=clrk80ign +units=m +no_defs');
            } else {
                console.warn(`Unknown CRS ${sourceCRS}. Attempting transformation anyway.`);
            }
        }

        // Transform coordinates recursively
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

        // Transform all features
        const transformedGeoJSON = {
            ...geojson,
            features: geojson.features.map(feature => {
                if (!feature.geometry || !feature.geometry.coordinates) {
                    return feature;
                }
                
                try {
                    return {
                        ...feature,
                        geometry: {
                            ...feature.geometry,
                            coordinates: transformCoordinates(feature.geometry.coordinates)
                        }
                    };
                } catch (error) {
                    console.error('Error transforming feature:', error);
                    return feature;
                }
            })
        };

        return transformedGeoJSON;
    };

    const processShapefile = async (shpFile, fileGroup, baseName) => {
        try {
            // Read the .shp file as ArrayBuffer
            const shpBuffer = await shpFile.arrayBuffer();
            
            // Try to read associated files if available
            let dbfBuffer = null;
            let prjBuffer = null;
            let cpgBuffer = null;
            
            console.log(`Reading shapefile components for ${baseName}:`, {
                hasShp: !!fileGroup.shp,
                hasShx: !!fileGroup.shx,
                hasDbf: !!fileGroup.dbf,
                hasPrj: !!fileGroup.prj,
                hasCpg: !!fileGroup.cpg
            });
            
            if (fileGroup.dbf) {
                console.log(`Reading .dbf file: ${fileGroup.dbf.name}`);
                dbfBuffer = await fileGroup.dbf.arrayBuffer();
            }
            if (fileGroup.prj) {
                console.log(`Reading .prj file: ${fileGroup.prj.name}`);
                // Read PRJ file with UTF-8 encoding
                prjBuffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsText(fileGroup.prj, 'UTF-8');
                });
                console.log(`PRJ file read successfully, length: ${prjBuffer ? prjBuffer.length : 0}`);
            } else {
                console.warn(`No .prj file found in fileGroup for ${baseName}. Available files:`, Object.keys(fileGroup));
            }
            // Determine DBF encoding from CPG file
            let dbfEncoding = 'UTF-8'; // Default encoding
            if (fileGroup.cpg) {
                console.log(`Reading .cpg file: ${fileGroup.cpg.name}`);
                // Read CPG file with UTF-8 encoding (CPG file contains code page name like "UTF-8" or "1252")
                cpgBuffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsText(fileGroup.cpg, 'UTF-8');
                });
                // Parse CPG content to determine encoding
                const cpgContent = cpgBuffer.trim().toUpperCase();
                if (cpgContent === '1252' || cpgContent === 'WINDOWS-1252' || cpgContent === 'CP1252') {
                    dbfEncoding = 'Windows-1252';
                } else if (cpgContent === 'UTF-8' || cpgContent === 'UTF8') {
                    dbfEncoding = 'UTF-8';
                } else if (cpgContent === 'ISO-8859-1' || cpgContent === 'LATIN1' || cpgContent === '8859-1') {
                    dbfEncoding = 'ISO-8859-1';
                } else if (cpgContent) {
                    // Try to extract encoding number
                    const encodingMatch = cpgContent.match(/(\d+)/);
                    if (encodingMatch && encodingMatch[1] === '1252') {
                        dbfEncoding = 'Windows-1252';
                    }
                }
                console.log(`CPG file content: "${cpgBuffer}" → Detected DBF encoding: ${dbfEncoding}`);
            } else {
                console.log('No CPG file found, assuming UTF-8 encoding for DBF');
            }

            // Extract CRS from PRJ file
            let sourceCRS = null;
            if (prjBuffer) {
                console.log('Shapefile projection (PRJ file content):', prjBuffer);
                console.log('PRJ file length:', prjBuffer.length);
                sourceCRS = extractEPSGFromPRJ(prjBuffer);
                if (sourceCRS) {
                    console.log(`✓ Detected CRS from PRJ: ${sourceCRS}`);
                } else {
                    console.warn('⚠ Could not extract EPSG code from PRJ file. PRJ content:', prjBuffer.substring(0, 200));
                    console.warn('Attempting to detect from coordinates...');
                }
            } else {
                console.warn('⚠ No PRJ file found. Attempting to detect CRS from coordinates...');
            }

            // Read .shx file if available (required for shapefile parsing)
            let shxBuffer = null;
            if (fileGroup.shx) {
                shxBuffer = await fileGroup.shx.arrayBuffer();
            }

            // Use shpjs to parse the shapefile
            // Note: shpjs may not transform coordinates automatically, so we'll do it manually
            let geojson;
            try {
                const shapefileObject = {
                    shp: shpBuffer
                };
                
                // Include .shx if available (shpjs uses it for indexing)
                if (shxBuffer) {
                    shapefileObject.shx = shxBuffer;
                }
                
                if (dbfBuffer) {
                    shapefileObject.dbf = dbfBuffer;
                }
                // Don't pass prj to shpjs if we're going to transform manually
                // shpjs might transform, but we want consistent control
                // Pass CPG as string to shpjs (it contains encoding name like "1252" or "UTF-8")
                if (cpgBuffer) {
                    shapefileObject.cpg = cpgBuffer.trim();
                }

                // Use getShapefile with object format
                geojson = await getShapefile(shapefileObject);
            } catch (parseError) {
                console.error('Shapefile parsing error:', parseError);
                // Fallback: try parsing shp and dbf separately if combine is needed
                try {
                    if (dbfBuffer) {
                        const shpFeatures = await parseShp(shpBuffer, prjBuffer);
                        // Pass CPG content (encoding name) to parseDbf
                        const cpgContent = cpgBuffer ? cpgBuffer.trim() : null;
                        const dbfData = await parseDbf(dbfBuffer, cpgContent);
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

            // Post-process to ensure UTF-8 characters are preserved in properties
            // Convert DBF attributes from detected encoding to UTF-8
            if (geojson && geojson.features) {
                geojson.features = geojson.features.map(feature => {
                    if (feature.properties) {
                        const processedProperties = {};
                        Object.keys(feature.properties).forEach(key => {
                            let value = feature.properties[key];
                            
                            // Convert string values from DBF encoding to UTF-8
                            if (typeof value === 'string' && value.length > 0 && dbfEncoding !== 'UTF-8') {
                                try {
                                    if (dbfEncoding === 'Windows-1252') {
                                        // Convert string characters back to bytes (assuming they represent Windows-1252 bytes)
                                        // Then convert those bytes using our Windows-1252 to UTF-8 converter
                                        const bytes = new Uint8Array(value.length);
                                        for (let i = 0; i < value.length; i++) {
                                            const charCode = value.charCodeAt(i);
                                            // If character is in Latin-1 range, treat as Windows-1252 byte
                                            if (charCode < 256) {
                                                bytes[i] = charCode;
                                            } else {
                                                // Character outside Latin-1 range, might be already UTF-8
                                                // Keep as-is or convert to '?'
                                                bytes[i] = 0x3F; // '?'
                                            }
                                        }
                                        // Convert Windows-1252 bytes to UTF-8 string
                                        value = convertWindows1252ToUTF8(bytes);
                                    } else if (dbfEncoding === 'ISO-8859-1') {
                                        // ISO-8859-1 is similar to Windows-1252 for most characters
                                        const decoder = new TextDecoder('iso-8859-1', { fatal: false });
                                        const bytes = new Uint8Array(value.length);
                                        for (let i = 0; i < value.length; i++) {
                                            const charCode = value.charCodeAt(i);
                                            bytes[i] = charCode < 256 ? charCode : 0x3F;
                                        }
                                        value = decoder.decode(bytes);
                                    }
                                } catch (error) {
                                    console.warn(`Failed to convert encoding for property "${key}":`, error);
                                    // Keep original value if conversion fails
                                }
                            }
                            
                            // Apply preserveUTF8 to ensure proper encoding
                            processedProperties[key] = preserveUTF8(value);
                        });
                        return {
                            ...feature,
                            properties: processedProperties
                        };
                    }
                    return feature;
                });
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

            // Detect CRS from coordinates if not found in PRJ
            if (!sourceCRS && geojson.features && geojson.features.length > 0) {
                const firstFeature = geojson.features[0];
                if (firstFeature.geometry && firstFeature.geometry.coordinates) {
                    const coords = firstFeature.geometry.coordinates;
                    // Check if coordinates look like UTM (large numbers, typically > 100000)
                    const firstCoord = Array.isArray(coords[0]) ? coords[0][0] : coords[0];
                    if (typeof firstCoord === 'number' && Math.abs(firstCoord) > 100000) {
                        // Likely UTM coordinates
                        // Check Y coordinate to determine hemisphere
                        const secondCoord = Array.isArray(coords[0]) ? coords[0][1] : coords[1];
                        if (typeof secondCoord === 'number' && secondCoord > 0 && secondCoord < 10000000) {
                            // Northern hemisphere UTM
                            // Try to detect zone from X coordinate (UTM zones are 6 degrees wide)
                            // Zone 32 covers 6°E to 12°E, which corresponds to roughly 500000-900000m easting
                            const xCoord = Math.abs(firstCoord);
                            if (xCoord >= 300000 && xCoord <= 900000) {
                                // Likely Zone 32 - default to WGS84 (EPSG:32632) as it's more common
                                console.warn('Detected UTM Zone 32N coordinates but no PRJ file. Assuming EPSG:32632 (WGS84 UTM Zone 32N).');
                                sourceCRS = 'EPSG:32632';
                            } else {
                                // Default to Tunisia projection for other zones
                                console.warn('Detected UTM coordinates but no PRJ file. Assuming EPSG:22391 (Tunisia UTM Zone 32N).');
                                sourceCRS = 'EPSG:22391';
                            }
                        }
                    }
                }
            }

            // Transform coordinates if needed
            if (sourceCRS && sourceCRS !== 'EPSG:4326') {
                console.log(`Transforming shapefile coordinates from ${sourceCRS} to EPSG:4326`);
                geojson = transformGeoJSONCoordinates(geojson, sourceCRS);
                console.log('Coordinate transformation completed');
            } else if (!sourceCRS) {
                console.log('No CRS detected. Assuming coordinates are already in WGS84 (EPSG:4326).');
            }

            console.log('Parsed Shapefile:', geojson);
            // Add layer directly (coordinates are already transformed)
            addLayer(baseName, 'geojson', geojson, baseName);
        } catch (error) {
            console.error('Error parsing shapefile:', error);
            alert(`Error parsing shapefile ${baseName}: ${error.message}\n\nNote: Shapefiles work best with .shp, .shx, and .dbf files. Please select all related files when uploading.`);
        }
    };

    // Helper function to escape HTML to prevent XSS (preserves UTF-8)
    const escapeHtml = (text) => {
        if (text === null || text === undefined) return 'N/A';
        const div = document.createElement('div');
        // Use textContent which preserves UTF-8 encoding
        div.textContent = preserveUTF8(text);
        return div.innerHTML;
    };

    // Utility function to convert KML color format (AABBGGRR) to hex
    const convertKMLColorToHex = (kmlColor) => {
        if (!kmlColor) return null;
        
        // Remove any whitespace
        const color = kmlColor.trim();
        
        // If it's already a hex color (starts with #), return as is
        if (color.startsWith('#')) {
            return color.length === 7 ? color : color.substring(0, 7); // Return 6-digit hex
        }
        
        // If it's an 8-digit hex (KML format: AABBGGRR), convert to standard hex (RRGGBB)
        if (/^[0-9a-fA-F]{8}$/.test(color)) {
            const r = color.substring(6, 8);
            const g = color.substring(4, 6);
            const b = color.substring(2, 4);
            return `#${r}${g}${b}`;
        }
        
        // If it's a 6-digit hex without #, add #
        if (/^[0-9a-fA-F]{6}$/.test(color)) {
            return `#${color}`;
        }
        
        // Try to parse RGB/RGBA format
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        
        return null;
    };

    // Utility function to convert opacity value to 0-1 range
    const normalizeOpacity = (opacity) => {
        if (opacity === null || opacity === undefined || opacity === '') return null;
        
        const num = parseFloat(opacity);
        if (isNaN(num)) return null;
        
        // If value is > 1, assume it's 0-255 range, convert to 0-1
        if (num > 1) {
            return num / 255;
        }
        
        // If value is already 0-1, return as is
        return Math.max(0, Math.min(1, num));
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

    // Generate a random color that's different from existing layer colors
    const getRandomUniqueColor = (existingColors) => {
        const predefinedColors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
            '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
            '#14b8a6', '#22c55e', '#eab308', '#a855f7', '#d97706',
            '#dc2626', '#0891b2', '#1f2937', '#6b7280'
        ];
        
        // First try predefined colors that aren't used
        const unusedPredefined = predefinedColors.filter(color => !existingColors.includes(color));
        if (unusedPredefined.length > 0) {
            return unusedPredefined[Math.floor(Math.random() * unusedPredefined.length)];
        }
        
        // If all predefined are used, generate a random color
        const generateRandomColor = () => {
            const hue = Math.floor(Math.random() * 360);
            const saturation = 60 + Math.floor(Math.random() * 30); // 60-90%
            const lightness = 45 + Math.floor(Math.random() * 15); // 45-60%
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        };
        
        let newColor;
        let attempts = 0;
        do {
            newColor = generateRandomColor();
            attempts++;
        } while (existingColors.includes(newColor) && attempts < 50);
        
        return newColor;
    };

    const addLayer = (name, type, data, category) => {
        const id = Date.now() + Math.random();
        
        // Get existing layer colors
        const existingColors = layers.map(l => l.color);
        
        // Assign a random unique color
        const layerColor = getRandomUniqueColor(existingColors);
        
        const newLayer = {
            id,
            name,
            type,
            data,
            visible: true,
            color: layerColor,
            category,
            colorByAttribute: null, // Attribute name to color by, or null for single color
            customColorMap: {} // Custom colors for attribute values: { normalizedValue: color }
        };
        
        // Update selected color to match the new layer's color
        setSelectedColor(layerColor);

        // Add category if it doesn't exist
        if (!categories[category]) {
            setCategories(prevCategories => ({
                ...prevCategories,
                [category]: {
                    expanded: true
                }
            }));
        }

        setLayers(prevLayers => {
            const updatedLayers = [...prevLayers, newLayer];
            
            // Update z-index for all layers to ensure correct rendering order
            setTimeout(() => {
                updateLayerZIndex(updatedLayers, categories);
                checkSpatialQuery(updatedLayers);
            }, 100);
            
            return updatedLayers;
        });

        if (type === 'geojson' && map) {
            // Store layer ID for later style updates
            const layerId = id;
            
            const geoLayer = L.geoJSON(data, {
                style: (feature) => {
                    // Use default color initially - will be updated by updateLayerStyles if colorByAttribute is set
                    let fillColor = layerColor;
                    let fillOpacity = 0.3;
                    
                    if (feature.properties) {
                        // Extract fill color from properties
                        if (feature.properties.fill) {
                            const convertedColor = convertKMLColorToHex(feature.properties.fill);
                            if (convertedColor) {
                                fillColor = convertedColor;
                            } else {
                                fillColor = feature.properties.fill;
                            }
                        }
                        
                        // Extract fill-opacity from properties
                        if (feature.properties['fill-opacity'] !== undefined && feature.properties['fill-opacity'] !== null && feature.properties['fill-opacity'] !== '') {
                            const normalizedOpacity = normalizeOpacity(feature.properties['fill-opacity']);
                            if (normalizedOpacity !== null) {
                                fillOpacity = normalizedOpacity;
                            }
                        }
                    }
                    
                    return {
                        color: fillColor,
                        fillColor: fillColor,
                        weight: 2,
                        fillOpacity: fillOpacity,
                        opacity: 1
                    };
                },
                pointToLayer: (feature, latlng) => {
                    // Check if feature has fill color in metadata
                    let fillColor = layerColor;
                    let fillOpacity = 0.6;
                    
                    if (feature.properties) {
                        // Extract fill color from properties
                        if (feature.properties.fill) {
                            const convertedColor = convertKMLColorToHex(feature.properties.fill);
                            if (convertedColor) {
                                fillColor = convertedColor;
                            } else {
                                fillColor = feature.properties.fill;
                            }
                        }
                        
                        // Extract fill-opacity from properties
                        if (feature.properties['fill-opacity'] !== undefined && feature.properties['fill-opacity'] !== null && feature.properties['fill-opacity'] !== '') {
                            const normalizedOpacity = normalizeOpacity(feature.properties['fill-opacity']);
                            if (normalizedOpacity !== null) {
                                fillOpacity = normalizedOpacity;
                            }
                        }
                    }
                    
                    return L.circleMarker(latlng, {
                        radius: 6,
                        fillColor: fillColor,
                        color: fillColor,
                        weight: 2,
                        opacity: 1,
                        fillOpacity: fillOpacity
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
            
            // Store reference to update style when colorByAttribute changes
            geoLayer._layerId = id;
            
            // Update z-index after adding layer to ensure correct rendering order
            setTimeout(() => {
                setLayers(currentLayers => {
                    updateLayerZIndex(currentLayers, categories);
                    return currentLayers;
                });
            }, 100);
        }
    };

    // Function to update layer styles when colorByAttribute changes
    const updateLayerStyles = (layer) => {
        if (!map || !layerGroupsRef.current[layer.id]) return;
        
        const leafletLayer = layerGroupsRef.current[layer.id];
        const colorMap = layer.colorByAttribute ? generateAttributeColorMap(layer, layer.colorByAttribute) : null;
        
        if (leafletLayer.eachLayer) {
            leafletLayer.eachLayer((featureLayer) => {
                if (featureLayer.feature && featureLayer.feature.properties) {
                    let fillColor = layer.color;
                    
                    if (layer.colorByAttribute && colorMap) {
                        const attrValue = featureLayer.feature.properties[layer.colorByAttribute];
                        if (attrValue !== undefined && attrValue !== null) {
                            const normalized = attrValue.toString().trim().toLowerCase();
                            fillColor = colorMap[normalized] || layer.color;
                        }
                    }
                    
                    if (featureLayer.setStyle) {
                        featureLayer.setStyle({
                            color: fillColor,
                            fillColor: fillColor,
                            weight: 2,
                            fillOpacity: 0.3,
                            opacity: 1
                        });
                    }
                }
            });
        }
    };

    // Spatial query: Highlight CSV points that are inside KML polygons
    const checkSpatialQuery = (layersList) => {
        if (!map) return;
        
        // Find CSV/Excel point layers and KML polygon layers
        const pointLayers = layersList.filter(layer => {
            if (!layer.data || !layer.data.features || layer.data.features.length === 0) return false;
            const firstFeature = layer.data.features[0];
            return firstFeature && firstFeature.geometry && firstFeature.geometry.type === 'Point';
        });
        
        const polygonLayers = layersList.filter(layer => {
            if (!layer.data || !layer.data.features || layer.data.features.length === 0) return false;
            const firstFeature = layer.data.features[0];
            return firstFeature && firstFeature.geometry && 
                   (firstFeature.geometry.type === 'Polygon' || firstFeature.geometry.type === 'MultiPolygon');
        });
        
        if (pointLayers.length === 0 || polygonLayers.length === 0) {
            // Remove existing highlights if no valid layers
            Object.values(highlightLayersRef.current).forEach(highlightLayer => {
                if (map && highlightLayer) {
                    map.removeLayer(highlightLayer);
                }
            });
            highlightLayersRef.current = {};
            return;
        }
        
        // Check each point layer against each polygon layer
        pointLayers.forEach(pointLayer => {
            const highlightedFeatures = [];
            
            pointLayer.data.features.forEach(feature => {
                if (feature.geometry && feature.geometry.type === 'Point') {
                    const point = feature.geometry.coordinates;
                    
                    // Check if point is inside any polygon layer
                    const isInside = polygonLayers.some(polyLayer => 
                        pointInLayerPolygons(point, polyLayer)
                    );
                    
                    if (isInside) {
                        highlightedFeatures.push(feature);
                    }
                }
            });
            
            // Remove old highlight layer for this point layer
            if (highlightLayersRef.current[pointLayer.id]) {
                map.removeLayer(highlightLayersRef.current[pointLayer.id]);
            }
            
            // Create new highlight layer with yellow outer ring and original color inside
            if (highlightedFeatures.length > 0) {
                const originalColor = pointLayer.color || '#3b82f6';
                
                const highlightLayer = L.geoJSON({
                    type: 'FeatureCollection',
                    features: highlightedFeatures
                }, {
                    pointToLayer: (feature, latlng) => {
                        // Create a custom div icon with yellow outer circle and original color inner circle
                        const outerRadius = 10;
                        const innerRadius = 6;
                        
                        const icon = L.divIcon({
                            className: 'highlighted-point-marker',
                            html: `
                                <div style="
                                    width: ${outerRadius * 2}px;
                                    height: ${outerRadius * 2}px;
                                    border-radius: 50%;
                                    background: #fbbf24;
                                    border: 2px solid #f59e0b;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
                                ">
                                    <div style="
                                        width: ${innerRadius * 2}px;
                                        height: ${innerRadius * 2}px;
                                        border-radius: 50%;
                                        background: ${originalColor};
                                        border: 1px solid ${originalColor};
                                    "></div>
                                </div>
                            `,
                            iconSize: [outerRadius * 2, outerRadius * 2],
                            iconAnchor: [outerRadius, outerRadius]
                        });
                        
                        return L.marker(latlng, { icon: icon });
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
                
                highlightLayersRef.current[pointLayer.id] = highlightLayer;
            }
        });
    };

    // Update z-index for all layers based on category and layer order
    const updateLayerZIndex = (layersList, categoriesList) => {
        if (!map) return;
        
        const categoryOrder = Object.keys(categoriesList);
        
        categoryOrder.forEach((catName, catIdx) => {
            const layersInCategory = layersList.filter(l => l.category === catName);
            
            layersInCategory.forEach((layer, layerIdx) => {
                const leafletLayer = layerGroupsRef.current[layer.id];
                if (leafletLayer) {
                    // Category index * 1000 gives major separation between categories
                    // Layer index within category gives minor separation
                    // This ensures categories render in order, with layers within categories also ordered
                    const zIndex = 1000 + (catIdx * 1000) + layerIdx;
                    leafletLayer.setZIndex(zIndex);
                }
            });
        });
    };

    const moveCategory = (categoryName, direction) => {
        setCategories(prevCategories => {
            const categoryEntries = Object.entries(prevCategories);
            const index = categoryEntries.findIndex(([name]) => name === categoryName);
            
            if (index === -1) return prevCategories;
            
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            
            if (targetIndex < 0 || targetIndex >= categoryEntries.length) {
                return prevCategories; // Can't move further
            }
            
            // Swap categories
            const newEntries = [...categoryEntries];
            [newEntries[index], newEntries[targetIndex]] = [newEntries[targetIndex], newEntries[index]];
            
            // Rebuild categories object with new order
            const newCategories = {};
            newEntries.forEach(([name, data]) => {
                newCategories[name] = data;
            });
            
            // Update z-index for all layers based on new category order
            setLayers(prevLayers => {
                updateLayerZIndex(prevLayers, newCategories);
                return prevLayers; // Return unchanged layers array
            });
            
            return newCategories;
        });
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
        setLayers(prevLayers => {
            const updatedLayers = prevLayers.map(layer => {
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
            });
            
            // Update z-index after visibility change
            setTimeout(() => {
                updateLayerZIndex(updatedLayers, categories);
            }, 50);
            
            return updatedLayers;
        });
    };

    const changeLayerColor = (layerId, newColor) => {
        setLayers(prevLayers => {
            const updatedLayers = prevLayers.map(layer => {
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
            });
            
            // Update z-index after color change to ensure order is maintained
            setTimeout(() => {
                updateLayerZIndex(updatedLayers, categories);
            }, 50);
            
            return updatedLayers;
        });
    };

    const handleColorSelection = (color) => {
        setSelectedColor(color);
        if (selectedLayer) {
            changeLayerColor(selectedLayer.id, color);
        }
    };

    // Get available attributes from a layer (excluding coordinate fields)
    const getLayerAttributes = (layer) => {
        if (!layer || !layer.data || !layer.data.features || layer.data.features.length === 0) {
            return [];
        }
        
        const firstFeature = layer.data.features[0];
        if (!firstFeature.properties) {
            return [];
        }
        
        return Object.keys(firstFeature.properties).filter(attr => {
            const lowerAttr = attr.toLowerCase();
            return lowerAttr !== 'x' && 
                   lowerAttr !== 'y' && 
                   lowerAttr !== 'lon' && 
                   lowerAttr !== 'lat' &&
                   lowerAttr !== 'fill' &&
                   lowerAttr !== 'fill-opacity';
        });
    };

    // Get unique attribute values with their original and normalized forms
    const getAttributeValues = (layer, attributeName) => {
        if (!layer || !layer.data || !layer.data.features || !attributeName) {
            return [];
        }
        
        const valueMap = {}; // normalized -> { original, normalized }
        layer.data.features.forEach(feature => {
            if (feature.properties && feature.properties[attributeName] !== undefined) {
                const originalValue = feature.properties[attributeName];
                const normalized = originalValue !== null && originalValue !== undefined 
                    ? originalValue.toString().trim().toLowerCase() 
                    : 'Unknown';
                
                if (!valueMap[normalized]) {
                    valueMap[normalized] = {
                        original: originalValue !== null && originalValue !== undefined ? originalValue.toString() : 'Unknown',
                        normalized: normalized
                    };
                }
            }
        });
        
        return Object.values(valueMap).sort((a, b) => a.original.localeCompare(b.original));
    };

    // Generate color mapping for attribute values
    const generateAttributeColorMap = (layer, attributeName) => {
        if (!layer || !layer.data || !layer.data.features || !attributeName) {
            return {};
        }
        
        const values = getAttributeValues(layer, attributeName);
        const colorMap = {};
        const predefinedColors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
            '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
            '#14b8a6', '#22c55e', '#eab308', '#a855f7', '#d97706',
            '#dc2626', '#0891b2', '#1f2937', '#6b7280', '#f43f5e',
            '#0ea5e9', '#a3e635', '#fb923c', '#c084fc', '#60a5fa'
        ];
        
        values.forEach((valueObj, index) => {
            // Use custom color if available, otherwise use predefined
            const normalized = valueObj.normalized;
            colorMap[normalized] = layer.customColorMap && layer.customColorMap[normalized]
                ? layer.customColorMap[normalized]
                : predefinedColors[index % predefinedColors.length];
        });
        
        return colorMap;
    };

    // Set color-by-attribute for a layer
    const setColorByAttribute = (layerId, attributeName) => {
        setLayers(prevLayers => {
            const updatedLayers = prevLayers.map(layer => {
                if (layer.id === layerId) {
                    const updatedLayer = { 
                        ...layer, 
                        colorByAttribute: attributeName || null,
                        // Reset custom color map when changing attribute
                        customColorMap: attributeName ? (layer.customColorMap || {}) : {}
                    };
                    
                    // Update layer styles
                    setTimeout(() => {
                        updateLayerStyles(updatedLayer);
                    }, 50);
                    
                    return updatedLayer;
                }
                return layer;
            });
            
            return updatedLayers;
        });
    };

    // Update color for a specific attribute value
    const updateAttributeValueColor = (layerId, normalizedValue, newColor) => {
        setLayers(prevLayers => {
            const updatedLayers = prevLayers.map(layer => {
                if (layer.id === layerId) {
                    const updatedLayer = {
                        ...layer,
                        customColorMap: {
                            ...(layer.customColorMap || {}),
                            [normalizedValue]: newColor
                        }
                    };
                    
                    // Update layer styles
                    setTimeout(() => {
                        updateLayerStyles(updatedLayer);
                    }, 50);
                    
                    return updatedLayer;
                }
                return layer;
            });
            
            return updatedLayers;
        });
    };

    const deleteLayer = (id) => {
        const leafletLayer = layerGroupsRef.current[id];
        if (map && leafletLayer) {
            map.removeLayer(leafletLayer);
            delete layerGroupsRef.current[id];
        }
        
        // Remove highlight layer if exists
        if (highlightLayersRef.current[id]) {
            map.removeLayer(highlightLayersRef.current[id]);
            delete highlightLayersRef.current[id];
        }
        
        setLayers(prevLayers => {
            const updatedLayers = prevLayers.filter(layer => layer.id !== id);
            
            // Update z-index and trigger spatial query check after deletion
            setTimeout(() => {
                updateLayerZIndex(updatedLayers, categories);
                checkSpatialQuery(updatedLayers);
            }, 100);
            
            const remainingLayers = updatedLayers;
            
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
                accept=".csv,.geojson,.json,.xlsx,.xls,.shp,.shx,.dbf,.prj,.cpg,.kml"
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
                moveCategory={moveCategory}
                setColorByAttribute={setColorByAttribute}
                getLayerAttributes={getLayerAttributes}
                getAttributeValues={getAttributeValues}
                generateAttributeColorMap={generateAttributeColorMap}
                updateAttributeValueColor={updateAttributeValueColor}
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