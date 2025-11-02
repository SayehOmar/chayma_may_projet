
import React from 'react';
import LayerItem from './LayerItem';

const Category = ({ name, data, layers, toggleCategory, toggleLayerVisibility, deleteLayer, selectLayer, selectedLayer }) => {
    const categoryColor = layers.length > 0 ? layers[0].color : '#808080'; // Default color if no layers

    return (
        <div className="category-folder">
            <div className="category-header" onClick={() => toggleCategory(name)}>
                <i className={`fas fa-chevron-right chevron ${data.expanded ? 'expanded' : ''}`}></i>
                <div className="color-indicator" style={{ backgroundColor: categoryColor }}></div>
                <span className="category-name">{name}</span>
            </div>
            <div className={`category-content ${data.expanded ? 'expanded' : ''}`}>
                {layers.map(layer => (
                    <LayerItem
                        key={layer.id}
                        layer={layer}
                        toggleLayerVisibility={toggleLayerVisibility}
                        deleteLayer={deleteLayer}
                        selectLayer={selectLayer}
                        selectedLayer={selectedLayer}
                    />
                ))}
            </div>
        </div>
    );
};

export default Category;
