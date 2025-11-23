import React from 'react';
import LayersList from './LayersList';

const LeftSidebar = ({ layers, categories, toggleCategory, toggleLayerVisibility, deleteLayer, selectLayer, selectedLayer, moveCategory, setColorByAttribute, getLayerAttributes }) => {
    const handleUploadClick = () => {
        document.getElementById('fileInput').click();
    };

    return (
        <div className="left-sidebar">
            <div className="sidebar-header">
                <div className="header-top">
                    <h2>Layers</h2>
                    <div className="header-actions">
                        <button className="icon-btn" title="Settings">
                            <i className="fas fa-cog"></i>
                        </button>
                        <button className="icon-btn" onClick={handleUploadClick} title="Upload">
                            <i className="fas fa-upload"></i>
                        </button>
                    </div>
                </div>
            </div>
            <LayersList
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
            />
        </div>
    );
};

export default LeftSidebar;