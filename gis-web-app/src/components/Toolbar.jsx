
import React from 'react';

const Toolbar = ({ showBufferDialog }) => {
    return (
        <div className="top-toolbar">
            <button className="toolbar-btn" onClick={showBufferDialog} title="Buffer Analysis">
                <i className="fas fa-layer-group"></i>
            </button>
            <div className="toolbar-divider"></div>
            <button className="toolbar-btn" title="Select">
                <i className="fas fa-mouse-pointer"></i>
            </button>
            <button className="toolbar-btn" title="Draw">
                <i className="fas fa-pencil-alt"></i>
            </button>
        </div>
    );
};

export default Toolbar;
