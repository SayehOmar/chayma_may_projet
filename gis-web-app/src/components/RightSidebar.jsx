import React, { useState, useEffect, useRef } from 'react';
import * as L from 'leaflet';

const RightSidebar = ({ selectedColor, selectColor, zoomIn, zoomOut, setTool, activeTool, selectedLayer, projection, layerGroupsRef, map }) => {
    const [showLayerInfo, setShowLayerInfo] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [highlightedFeature, setHighlightedFeature] = useState(null);
    const highlightLayerRef = useRef(null);

    const colors = [
        '#1f2937', '#6b7280', '#dc2626', '#ec4899', '#a855f7',
        '#3b82f6', '#06b6d4', '#0891b2', '#14b8a6', '#10b981',
        '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#d97706'
        , '#ff0000ff', '#00fffbff', '#44ff00ff', '#ff8800ff', '#0033ffff', '#ff00a6ff'
    ];

    const handleSearch = (e) => {
        setSearchQuery(e.target.value);
        if (e.target.value === "") {
            setSearchResults([]);
            return;
        }
        if (selectedLayer) {
            const features = selectedLayer.data.features;
            const results = features.filter(feature => {
                const properties = Object.values(feature.properties);
                return properties.some(prop => prop.toString().toLowerCase().includes(e.target.value.toLowerCase()));
            });
            setSearchResults(results);
            if (results.length > 0) {
                const feature = results[0];
                const layer = L.geoJSON(feature);
                map.fitBounds(layer.getBounds());
            }
        }
    };

    useEffect(() => {
        if (highlightLayerRef.current) {
            map.removeLayer(highlightLayerRef.current);
        }
        if (highlightedFeature) {
            highlightLayerRef.current = L.geoJSON(highlightedFeature, {
                style: {
                    color: '#ff0',
                    weight: 5,
                    fillOpacity: 0.5
                }
            }).addTo(map);
        }
    }, [highlightedFeature, map]);


    const renderAttributes = () => {
        if (!selectedLayer || !selectedLayer.data || !selectedLayer.data.features || selectedLayer.data.features.length === 0) {
            return <p>No features available.</p>;
        }

        const features = selectedLayer.data.features;
        const attributes = Object.keys(features[0].properties);

        return (
            <table className="attribute-table">
                <thead>
                    <tr>
                        {attributes.map(attr => <th key={attr}>{attr}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {features.map((feature, index) => (
                        <tr key={index}>
                            {attributes.map(attr => <td key={attr}>{feature.properties[attr]}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const getExtent = () => {
        if (!selectedLayer || !layerGroupsRef.current[selectedLayer.id]) {
            return "N/A";
        }
        const bounds = layerGroupsRef.current[selectedLayer.id].getBounds();
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        return `[${southWest.lng.toFixed(4)}, ${southWest.lat.toFixed(4)}] to [${northEast.lng.toFixed(4)}, ${northEast.lat.toFixed(4)}]`;
    };

    const getCRS = () => {
        if (selectedLayer && selectedLayer.data && selectedLayer.data.crs && selectedLayer.data.crs.properties && selectedLayer.data.crs.properties.name) {
            return selectedLayer.data.crs.properties.name;
        }
        return projection;
    };

    return (
        <div className="right-sidebar">
            <div className="tabs">
                <button className="tab active">Data Actions</button>
                <button className={`tab ${showLayerInfo ? 'active' : ''}`} onClick={() => setShowLayerInfo(!showLayerInfo)}>Layer Infos</button>
            </div>
            <div className="tab-content">
                {showLayerInfo && selectedLayer ? (
                    <div className="section">
                        <div className="search-box">
                            <i className="fas fa-search search-icon"></i>
                            <input type="text" placeholder="Search" value={searchQuery} onChange={handleSearch} />
                        </div>
                        {searchResults.length > 0 && (
                            <div className="search-results">
                                <table className="attribute-table">
                                    <thead>
                                        <tr>
                                            {Object.keys(searchResults[0].properties).map(attr => <th key={attr}>{attr}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {searchResults.map((result, index) => (
                                            <tr key={index} 
                                                onMouseEnter={() => setHighlightedFeature(result)}
                                                onMouseLeave={() => setHighlightedFeature(null)}
                                                onClick={() => {
                                                    const layer = L.geoJSON(result);
                                                    map.fitBounds(layer.getBounds());
                                                }}>
                                                {Object.keys(result.properties).map(attr => <td key={attr}>{result.properties[attr]}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="section-title">Layer Information</div>
                        <div className="layer-info">
                            <p><strong>Name:</strong> {selectedLayer.name}</p>
                            <p><strong>Features:</strong> {selectedLayer.data.features.length}</p>
                            <p><strong>Geometry:</strong> {selectedLayer.data.features[0].geometry.type}</p>
                            <p><strong>CRS:</strong> {getCRS()}</p>

                        </div>
                        <div className="section-title">Attributes</div>
                        <div className="attribute-table-container">
                            {renderAttributes()}
                        </div>
                    </div>
                ) : (
                    <>


                        <div className="section">
                            <div className="section-title">Basic</div>
                            <div className="icon-grid">
                                <button className={`grid-icon-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}><i className="fas fa-mouse-pointer"></i></button>
                                <button className={`grid-icon-btn ${activeTool === 'pan' ? 'active' : ''}`} onClick={() => setTool('pan')}><i className="fas fa-hand-paper"></i></button>
                                <button className={`grid-icon-btn ${activeTool === 'draw' ? 'active' : ''}`} onClick={() => setTool('draw')}><i className="fas fa-pencil-alt"></i></button>
                                <button id="erase-button" className={`grid-icon-btn ${activeTool === 'erase' ? 'active' : ''}`} onClick={() => setTool('erase')}><i className="fas fa-eraser"></i></button>
                                <button className="grid-icon-btn" onClick={zoomIn}><i className="fas fa-expand"></i></button>
                                <button className="grid-icon-btn" onClick={zoomOut}><i className="fas fa-maximize"></i></button>
                            </div>
                        </div>

                        <div className="section">
                            <div className="section-title">Actions</div>
                            <div className="action-list">
                                <button className="action-item">
                                    <i className="fas fa-vector-square"></i>
                                    Vector Operations
                                </button>
                            </div>
                        </div>

                        <div className="section">
                            <div className="section-title">Import data from</div>
                            <div className="action-list">
                                <button className="action-item">
                                    <i className="fas fa-map" style={{ color: '#6b7280' }}></i>
                                    OpenStreetMap
                                </button>
                                <button className="action-item">
                                    <i className="fas fa-table" style={{ color: '#22c55e' }}></i>
                                    Google Sheets
                                </button>
                                <button className="action-item">
                                    <i className="fas fa-mountain" style={{ color: '#3b82f6' }}></i>
                                    Mapbox Terrain
                                </button>
                            </div>
                        </div>

                        <div className="section">
                            <div className="section-title">Color</div>
                            <div className="color-gradient" style={{ background: `linear-gradient(to bottom, white, ${selectedColor}, black)` }}></div>
                            <div className="color-palette">
                                {colors.map(color => (
                                    <div
                                        key={color}
                                        className={`color-swatch ${color === selectedColor ? 'selected' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => selectColor(color)}
                                    ></div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default RightSidebar;
