
import React, { useState } from 'react';

const LayerItem = ({ layer, toggleLayerVisibility, deleteLayer, selectLayer, selectedLayer, setColorByAttribute, getLayerAttributes }) => {
    const isSelected = selectedLayer && selectedLayer.id === layer.id;
    const [showAttributeSelector, setShowAttributeSelector] = useState(false);
    
    // Check if layer has polygon features
    const hasPolygons = layer.data && layer.data.features && layer.data.features.some(f => 
        f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    );
    
    const attributes = getLayerAttributes ? getLayerAttributes(layer) : [];
    const availableAttributes = attributes.filter(attr => {
        // Only show attributes that have some variation (not all the same value)
        if (!layer.data || !layer.data.features) return false;
        const values = new Set();
        layer.data.features.forEach(f => {
            if (f.properties && f.properties[attr] !== undefined) {
                values.add(f.properties[attr]);
            }
        });
        return values.size > 1; // Only show if there are multiple unique values
    });

    const handleAttributeChange = (e) => {
        e.stopPropagation();
        const attributeName = e.target.value;
        if (setColorByAttribute) {
            setColorByAttribute(layer.id, attributeName || null);
        }
        setShowAttributeSelector(false);
    };

    return (
        <div className={`layer-item ${isSelected ? 'selected' : ''}`} onClick={() => selectLayer(layer)}>
            <div className="color-indicator" style={{ backgroundColor: layer.color }}></div>
            <span className="layer-name">{layer.name}</span>
            <div className="layer-actions">
                {hasPolygons && availableAttributes.length > 0 && (
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            setShowAttributeSelector(!showAttributeSelector); 
                        }} 
                        title="Color by Attribute"
                        className={layer.colorByAttribute ? 'active' : ''}
                    >
                        <i className="fas fa-palette"></i>
                    </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }} title="Toggle Visibility">
                    <i className={`fas fa-eye${layer.visible ? '' : '-slash'}`}></i>
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} title="Delete">
                    <i className="fas fa-trash"></i>
                </button>
            </div>
            {showAttributeSelector && hasPolygons && availableAttributes.length > 0 && (
                <div className="attribute-selector-dropdown" onClick={(e) => e.stopPropagation()}>
                    <label>Color by:</label>
                    <select 
                        value={layer.colorByAttribute || ''} 
                        onChange={handleAttributeChange}
                        className="attribute-select"
                    >
                        <option value="">Single Color</option>
                        {availableAttributes.map(attr => (
                            <option key={attr} value={attr}>{attr}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
};

export default LayerItem;
