import React, { useState } from 'react';
import { ActionInputs, ActionData } from './ActionInputs';
import './ActionMenu.css';

export interface ActionOption {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface ActionMenuProps {
  visible: boolean;
  position?: 'top' | 'right';
  selectedCount?: number;
  onActionChange?: (actionData: ActionData) => void;
  onApply?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  customActions?: ActionOption[];
}

export const ActionMenu: React.FC<ActionMenuProps> = ({ 
  visible, 
  position = 'top', 
  selectedCount = 0,
  onActionChange,
  onApply,
  onCancel,
  disabled = false,
  customActions = []
}) => {
  if (!visible) return null;
  
  // Handle action changes
  const handleActionChange = (actionData: ActionData) => {
    if (onActionChange) {
      onActionChange(actionData);
    }
  };

  return (
    <div className={`action-menu ${position}`}>
      {selectedCount > 0 && (
        <div className="selected-count">
          {selectedCount} items selected
        </div>
      )}
      
      <div className="action-menu-content">
        <ActionInputs 
          onActionChange={handleActionChange} 
          inline={true}
          disabled={disabled}
        />
        
        <div className="action-menu-buttons">
          {onApply && (
            <button
              className="apply-button"
              onClick={onApply}
              disabled={disabled}
            >
              Apply
            </button>
          )}
          
          {onCancel && (
            <button
              className="cancel-button"
              onClick={onCancel}
              disabled={disabled}
            >
              Cancel
            </button>
          )}
          
          {customActions.map(action => (
            <button
              key={action.key}
              className="action-button"
              onClick={action.onClick}
              disabled={action.disabled || disabled}
              title={action.label}
            >
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};