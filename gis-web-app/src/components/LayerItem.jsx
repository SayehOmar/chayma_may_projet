
import React, { useState, useEffect, useRef } from 'react';

const LayerItem = ({ layer, toggleLayerVisibility, deleteLayer, selectLayer, selectedLayer, setColorByAttribute, getLayerAttributes, getAttributeValues, generateAttributeColorMap, updateAttributeValueColor }) => {
    const isSelected = selectedLayer && selectedLayer.id === layer.id;
    const [showAttributeSelector, setShowAttributeSelector] = useState(false);
    const [editingColor, setEditingColor] = useState(null);
    const colorPickerRef = useRef(null);
    
    // Close color picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
                setEditingColor(null);
            }
        };
        
        if (editingColor) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [editingColor]);
    
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

    // Get attribute values and color map for legend
    const attributeValues = layer.colorByAttribute && getAttributeValues 
        ? getAttributeValues(layer, layer.colorByAttribute) 
        : [];
    const colorMap = layer.colorByAttribute && generateAttributeColorMap
        ? generateAttributeColorMap(layer, layer.colorByAttribute)
        : {};

    const handleAttributeChange = (e) => {
        e.stopPropagation();
        const attributeName = e.target.value;
        if (setColorByAttribute) {
            setColorByAttribute(layer.id, attributeName || null);
        }
        setShowAttributeSelector(false);
    };

    const handleColorChange = (e, normalizedValue) => {
        e.stopPropagation();
        const newColor = e.target.value;
        if (updateAttributeValueColor) {
            updateAttributeValueColor(layer.id, normalizedValue, newColor);
        }
        setEditingColor(null);
    };

    return (
        <>
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
            {/* Legend showing colors and attribute values */}
            {layer.colorByAttribute && attributeValues.length > 0 && (
                <div className="attribute-legend" onClick={(e) => e.stopPropagation()}>
                    {attributeValues.map((valueObj) => {
                        const normalized = valueObj.normalized;
                        const color = colorMap[normalized] || layer.color;
                        const isEditing = editingColor === normalized;
                        
                        return (
                            <div key={normalized} className="legend-item">
                                <div className="legend-color-wrapper">
                                    <div 
                                        className="legend-color-indicator" 
                                        style={{ backgroundColor: color }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingColor(isEditing ? null : normalized);
                                        }}
                                        title="Click to change color"
                                    ></div>
                                    {isEditing && (
                                        <div 
                                            ref={colorPickerRef}
                                            className="color-picker-container" 
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <input
                                                type="color"
                                                value={color}
                                                onChange={(e) => handleColorChange(e, normalized)}
                                                className="color-picker-input"
                                                autoFocus
                                            />
                                        </div>
                                    )}
                                </div>
                                <span className="legend-value">{valueObj.original}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
};

export default LayerItem;
