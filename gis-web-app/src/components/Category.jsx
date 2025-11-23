
import React from 'react';
import LayerItem from './LayerItem';

const Category = ({ name, data, layers, toggleCategory, toggleLayerVisibility, deleteLayer, selectLayer, selectedLayer, moveCategory, isFirst, isLast, setColorByAttribute, getLayerAttributes }) => {
    const categoryColor = layers.length > 0 ? layers[0].color : '#808080'; // Default color if no layers

    return (
        <div className="category-folder">
            <div className="category-header">
                <div className="category-header-left" onClick={() => toggleCategory(name)}>
                    <i className={`fas fa-chevron-right chevron ${data.expanded ? 'expanded' : ''}`}></i>
                    <div className="color-indicator" style={{ backgroundColor: categoryColor }}></div>
                    <span className="category-name">{name}</span>
                </div>
                <div className="category-actions" onClick={(e) => e.stopPropagation()}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); moveCategory(name, 'up'); }}
                        disabled={isFirst}
                        title="Move Category Up"
                        className="category-order-btn"
                    >
                        <i className="fas fa-arrow-up"></i>
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); moveCategory(name, 'down'); }}
                        disabled={isLast}
                        title="Move Category Down"
                        className="category-order-btn"
                    >
                        <i className="fas fa-arrow-down"></i>
                    </button>
                </div>
            </div>
            <div className={`category-content ${data.expanded ? 'expanded' : ''}`}>
                    {layers.map((layer) => (
                        <LayerItem
                            key={layer.id}
                            layer={layer}
                            toggleLayerVisibility={toggleLayerVisibility}
                            deleteLayer={deleteLayer}
                            selectLayer={selectLayer}
                            selectedLayer={selectedLayer}
                            setColorByAttribute={setColorByAttribute}
                            getLayerAttributes={getLayerAttributes}
                        />
                    ))}
            </div>
        </div>
    );
};

export default Category;
