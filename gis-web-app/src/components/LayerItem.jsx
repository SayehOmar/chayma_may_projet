
import React from 'react';

const LayerItem = ({ layer, toggleLayerVisibility, deleteLayer, selectLayer, selectedLayer }) => {
    const isSelected = selectedLayer && selectedLayer.id === layer.id;

    return (
        <div className={`layer-item ${isSelected ? 'selected' : ''}`} onClick={() => selectLayer(layer)}>
            <div className="color-indicator" style={{ backgroundColor: layer.color }}></div>
            <span className="layer-name">{layer.name}</span>
            <div className="layer-actions">
                <button onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}>
                    <i className={`fas fa-eye${layer.visible ? '' : '-slash'}`}></i>
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}>
                    <i className="fas fa-trash"></i>
                </button>
            </div>
        </div>
    );
};

export default LayerItem;
