import React from 'react';
import { Tag, Flag } from 'lucide-react';
import './ActionMenu.css';

export interface ActionOption {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface ActionMenuProps {
  visible: boolean;
  position?: 'top' | 'right';
  selectedCount?: number;
  onCategoryAction?: () => void;
  onFlagAction?: () => void;
  customActions?: ActionOption[];
}

export const ActionMenu: React.FC<ActionMenuProps> = ({ 
  visible, 
  position = 'top', 
  selectedCount = 0,
  onCategoryAction,
  onFlagAction,
  customActions = []
}) => {
  if (!visible) return null;

  // Default actions for most cases
  const defaultActions: ActionOption[] = [
    {
      key: 'set-category',
      label: 'Set Category',
      icon: <Tag size={16} />,
      onClick: () => onCategoryAction && onCategoryAction(),
      disabled: !onCategoryAction
    },
    {
      key: 'add-flag',
      label: 'Add Flag',
      icon: <Flag size={16} />,
      onClick: () => onFlagAction && onFlagAction(),
      disabled: !onFlagAction
    }
  ];

  // Combine default and custom actions
  const actions = [...defaultActions, ...customActions];

  return (
    <div className={`action-menu ${position}`}>
      {selectedCount > 0 && (
        <div className="selected-count">
          {selectedCount} items selected
        </div>
      )}
      <div className="action-buttons">
        {actions.map(action => (
          <button
            key={action.key}
            className="action-button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.label}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};