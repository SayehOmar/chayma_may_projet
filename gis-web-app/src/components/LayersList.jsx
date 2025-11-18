
import React from 'react';
import Category from './Category';

const LayersList = ({ layers, categories, toggleCategory, toggleLayerVisibility, deleteLayer, selectLayer, selectedLayer, moveCategory }) => {
    const categoryEntries = Object.entries(categories);
    
    return (
        <div className="layers-list">
            {categoryEntries.map(([name, data], index) => (
                <Category
                    key={name}
                    name={name}
                    data={data}
                    layers={layers.filter(l => l.category === name)}
                    toggleCategory={toggleCategory}
                    toggleLayerVisibility={toggleLayerVisibility}
                    deleteLayer={deleteLayer}
                    selectLayer={selectLayer}
                    selectedLayer={selectedLayer}
                    moveCategory={moveCategory}
                    isFirst={index === 0}
                    isLast={index === categoryEntries.length - 1}
                />
            ))}
        </div>
    );
};

export default LayersList;
