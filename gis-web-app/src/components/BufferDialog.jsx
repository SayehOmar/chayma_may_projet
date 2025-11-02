
import React from 'react';

const BufferDialog = ({ show, closeBufferDialog, runBufferAnalysis }) => {
    if (!show) {
        return null;
    }

    return (
        <div className="dialog-overlay active">
            <div className="dialog">
                <h3>Buffer analysis</h3>
                <p>Buffer geometries or datasets to create an enlarged area</p>
                <div className="form-group">
                    <label>Create buffer around</label>
                    <select id="bufferType">
                        <option value="buildings">Buildings</option>
                        <option value="roads">Roads</option>
                        <option value="points">Points</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Buffer radius</label>
                    <input type="number" id="bufferRadius" defaultValue="1500" placeholder="1500 m" />
                </div>
                <div className="dialog-actions">
                    <button className="btn btn-secondary" onClick={closeBufferDialog}>Cancel</button>
                    <button className="btn btn-primary" onClick={runBufferAnalysis}>Run analysis</button>
                </div>
            </div>
        </div>
    );
};

export default BufferDialog;
