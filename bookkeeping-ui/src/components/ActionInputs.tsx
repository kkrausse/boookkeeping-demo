import React, { useState } from 'react';
import './ActionInputs.css';

// Common types used across the application
export interface ActionOption {
  id: string;
  label: string;
  checked: boolean;
  value: string;
}

export interface ActionData {
  category?: string;
  flagMessage?: string;
}

interface ActionInputsProps {
  onActionChange: (actionData: ActionData) => void;
  initialData?: ActionData;
  showTitle?: boolean;
  inline?: boolean;
  disabled?: boolean;
}

export const ActionInputs: React.FC<ActionInputsProps> = ({
  onActionChange,
  initialData = {},
  showTitle = true,
  inline = false,
  disabled = false,
}) => {
  // Initialize action options based on initial data
  const [actionOptions, setActionOptions] = useState<ActionOption[]>([
    { 
      id: 'category', 
      label: 'Set Category', 
      checked: !!initialData.category, 
      value: initialData.category || '' 
    },
    { 
      id: 'flag', 
      label: 'Add Flag', 
      checked: !!initialData.flagMessage, 
      value: initialData.flagMessage || '' 
    }
  ]);

  // Handle checkbox toggle
  const handleOptionChange = (id: string, checked: boolean) => {
    const newOptions = actionOptions.map(option => 
      option.id === id ? { ...option, checked } : option
    );
    setActionOptions(newOptions);
    
    // Notify parent of changes
    notifyActionChange(newOptions);
  };

  // Handle value input change
  const handleValueChange = (id: string, value: string) => {
    const newOptions = actionOptions.map(option => 
      option.id === id ? { ...option, value } : option
    );
    setActionOptions(newOptions);
    
    // Only notify if the option is checked
    const option = newOptions.find(opt => opt.id === id);
    if (option && option.checked) {
      notifyActionChange(newOptions);
    }
  };

  // Notify parent component of action data changes
  const notifyActionChange = (options: ActionOption[]) => {
    const actionData: ActionData = {};
    
    options.forEach(option => {
      if (option.checked && option.value) {
        if (option.id === 'category') {
          actionData.category = option.value;
        } else if (option.id === 'flag') {
          actionData.flagMessage = option.value;
        }
      }
    });
    
    onActionChange(actionData);
  };

  return (
    <div className={`action-inputs ${inline ? 'inline' : ''}`}>
      {showTitle && <h4>Actions to Apply</h4>}
      
      <div className="action-options">
        {actionOptions.map(option => (
          <div key={option.id} className="action-option">
            <div className="action-option-header">
              <label className="action-checkbox-label">
                <input
                  type="checkbox"
                  checked={option.checked}
                  onChange={(e) => handleOptionChange(option.id, e.target.checked)}
                  disabled={disabled}
                />
                {option.label}
              </label>
            </div>
            {option.checked && (
              <input
                type="text"
                value={option.value}
                onChange={(e) => handleValueChange(option.id, e.target.value)}
                placeholder={option.id === 'category' ? "Enter category name" : "Enter flag message"}
                className="action-input"
                disabled={disabled}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};