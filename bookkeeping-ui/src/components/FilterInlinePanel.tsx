import React, { useState, useEffect } from 'react';
import { 
  FilterParams, 
  TransactionRule, 
  FilterCondition,
  useCreateTransactionRule, 
  CreateRuleParams 
} from '../api/transactions';
import { PlusCircle, Check, Save, Loader2, Search } from 'lucide-react';
import { ActionInputs, ActionData } from './ActionInputs';
import './FilterInlinePanel.css';

type AmountComparisonType = '>' | '<' | '=' | '';

type FilterInlinePanelProps = {
  filters: FilterParams;
  onFilterChange: (filters: FilterParams) => void;
  isFiltersActive: boolean;
  clearFilters: () => void;
  showNotification: (type: 'success' | 'error', message: string) => void;
  totalCount?: number;
  flagCount?: number;
  onCreateRule?: () => void;
};

export const FilterInlinePanel: React.FC<FilterInlinePanelProps> = ({
  filters,
  onFilterChange,
  isFiltersActive,
  clearFilters,
  showNotification,
  totalCount,
  flagCount,
  onCreateRule
}) => {
  const [localFilters, setLocalFilters] = useState<FilterParams>({
    description: filters.description || '',
    amountValue: filters.amountValue || '',
    amountComparison: filters.amountComparison || '>'
  });

  // Update local filters when props change
  useEffect(() => {
    setLocalFilters({
      description: filters.description || '',
      amountValue: filters.amountValue || '',
      amountComparison: filters.amountComparison || '>'
    });
  }, [filters]);

  // This function is for local UI updates before sending to parent
  const handleLocalFilterChange = (field: keyof FilterParams, value: string) => {
    setLocalFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Apply filters when user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only apply if different from current filters
      if (
        localFilters.description !== filters.description || 
        localFilters.amountValue !== filters.amountValue ||
        localFilters.amountComparison !== filters.amountComparison
      ) {
        onFilterChange(localFilters);
      }
    }, 300); // Small debounce
    
    return () => clearTimeout(timer);
  }, [localFilters, filters, onFilterChange]);

  return (
    <div className="filter-inline-panel">
      {totalCount !== undefined && (
        <div className="filter-count-info">
          <div className="total-count">Total: {totalCount}</div>
          {flagCount !== undefined && flagCount > 0 && (
            <div className="flag-count">Flags: {flagCount}</div>
          )}
        </div>
      )}
      
      <div className="inline-filter-controls">
        <div className="inline-filter-group inline-description-filter">
          <div className="inline-search-input-wrapper">
            <Search className="inline-search-icon" size={16} />
            <input
              type="text"
              value={localFilters.description}
              onChange={(e) => handleLocalFilterChange('description', e.target.value)}
              placeholder="Search descriptions..."
              className="inline-filter-input"
            />
          </div>
        </div>
        
        <div className="inline-filter-group inline-amount-filter">
          <div className="inline-amount-filter-controls">
            <select
              value={localFilters.amountComparison}
              onChange={(e) => handleLocalFilterChange('amountComparison', e.target.value as AmountComparisonType)}
              className="inline-filter-select"
            >
              <option value=">">{">"}</option>
              <option value="<">{"<"}</option>
              <option value="=">{"="}</option>
            </select>
            <input
              type="number"
              value={localFilters.amountValue}
              onChange={(e) => handleLocalFilterChange('amountValue', e.target.value)}
              placeholder="Amount"
              className="inline-filter-input"
            />
          </div>
        </div>
        
        {isFiltersActive && (
          <button 
            className="inline-clear-filters-button"
            onClick={clearFilters}
            title="Clear all filters"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};