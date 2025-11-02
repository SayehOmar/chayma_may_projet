
import React from 'react';
import Category from './Category';

const LayersList = ({ layers, categories, toggleCategory, toggleLayerVisibility, deleteLayer, selectLayer, selectedLayer }) => {
    return (
        <div className="layers-list">
            {Object.entries(categories).map(([name, data]) => (
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
                />
            ))}
        </div>
    );
};

export default LayersList;
