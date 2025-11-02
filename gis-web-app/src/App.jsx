import proj4 from 'proj4';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import Papa from 'papaparse';
import LeftSidebar from './components/LeftSidebar';
import Map from './components/Map';
import RightSidebar from './components/RightSidebar';
import Toolbar from './components/Toolbar';
import BufferDialog from './components/BufferDialog';
import DrawTools from './components/DrawTools';
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

    useEffect(() => {
        if (!map) return;

        if (activeTool === 'pan') {
            map.dragging.enable();
        } else {
            map.dragging.disable();
        }
    }, [activeTool, map]);

    const [projection, setProjection] = useState('EPSG:22391');

    useEffect(() => {
        // Define the Carthage projection (Tunisia UTM Zone 32N)
        proj4.defs('EPSG:22391', '+proj=utm +zone=32 +north +ellps=clrk80ign +units=m +no_defs');
    }, []);

    const handleFileUpload = (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
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
                        
                        const features = results.data
                            .filter(row => row.X && row.Y && !isNaN(row.X) && !isNaN(row.Y))
                            .map(row => {
                                try {
                                    const x = parseFloat(row.X);
                                    const y = parseFloat(row.Y);
                                    
                                    const [lon, lat] = proj4('EPSG:22391', 'EPSG:4326', [x, y]);
                                    
                                    return {
                                        type: 'Feature',
                                        properties: {
                                            name: row.Sites || row.A || 'Unnamed',
                                            x: x,
                                            y: y
                                        },
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
                    },
                    error: (error) => {
                        console.error('CSV parsing error:', error);
                    }
                });
            } else if (ext === 'geojson' || ext === 'json') {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const geojson = JSON.parse(e.target.result);
                        addLayer(fileNameWithoutExt, 'geojson', geojson, fileNameWithoutExt);
                    } catch (error) {
                        console.error('Error parsing file:', error);
                    }
                };
                reader.readAsText(file);
            }
        }
        event.target.value = '';
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
                    if (feature.properties && feature.properties.name) {
                        layer.bindPopup(`<strong>${feature.properties.name}</strong>`);
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

    return (
        <div className="app-container">
            <input 
                type="file" 
                id="fileInput" 
                style={{ display: 'none' }} 
                multiple 
                accept=".csv,.geojson,.json"
                onChange={handleFileUpload}
            />
            <LeftSidebar
                layers={layers}
                categories={categories}
                toggleCategory={toggleCategory}
                toggleLayerVisibility={toggleLayerVisibility}
                deleteLayer={deleteLayer}
                selectLayer={selectLayer}
                selectedLayer={selectedLayer}
            />
            <div className="map-container">
                <Map setMap={setMap} />
                <Toolbar showBufferDialog={() => setShowBufferDialog(true)} />
                <DrawTools map={map} activeTool={activeTool} setTool={setTool} />
            </div>
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
            />
            <BufferDialog
                show={showBufferDialog}
                closeBufferDialog={() => setShowBufferDialog(false)}
                runBufferAnalysis={runBufferAnalysis}
            />
        </div>
    );
}

export default App;