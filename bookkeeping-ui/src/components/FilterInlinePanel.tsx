import React, { useState, useEffect } from 'react';
import { 
  FilterParams, 
  TransactionRule, 
  FilterCondition,
  useCreateTransactionRule, 
  CreateRuleParams
} from '../api/transactions';
import { useQueryClient } from '@tanstack/react-query';
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
};

export const FilterInlinePanel: React.FC<FilterInlinePanelProps> = ({
  filters,
  onFilterChange,
  isFiltersActive,
  clearFilters,
  showNotification,
  totalCount,
  flagCount
}) => {
  const [localFilters, setLocalFilters] = useState<FilterParams>({
    description: filters.description || '',
    amountValue: filters.amountValue || '',
    amountComparison: filters.amountComparison || ''
  });
  
  const [showRulePanel, setShowRulePanel] = useState(false);
  const [category, setCategory] = useState('');
  const [flagMessage, setFlagMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const queryClient = useQueryClient();
  const createRuleMutation = useCreateTransactionRule({
    pollingInterval: 1000, // 1 second polling interval for real-time updates
  });

  // Update local filters when props change
  useEffect(() => {
    setLocalFilters({
      description: filters.description || '',
      amountValue: filters.amountValue || '',
      amountComparison: filters.amountComparison || ''
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
        console.log('changing filters', localFilters, filters)
        onFilterChange(localFilters);
      }
    }, 300); // Small debounce
    
    return () => clearTimeout(timer);
  }, [localFilters, filters, onFilterChange]);
  
  // Close rule panel when filters are cleared
  useEffect(() => {
    if (!isFiltersActive && showRulePanel) {
      setShowRulePanel(false);
    }
  }, [isFiltersActive, showRulePanel]);
  
  const handleCreateRule = () => {
    // Validation checks
    if (!category && !flagMessage) {
      showNotification('error', 'Please provide a category or flag message');
      return;
    }
    
    if (!(filters.description || (filters.amountValue && filters.amountComparison))) {
      showNotification('error', 'Please set at least one filter condition');
      return;
    }
    
    // Create filter condition
    const filterCondition: FilterCondition = {};
    
    // Add description filter if provided
    if (localFilters.description) {
      filterCondition.description__icontains = localFilters.description;
    }
    
    // Add amount filter if both comparison and value are provided
    if (localFilters.amountValue && localFilters.amountComparison) {
      const amountValue = parseFloat(localFilters.amountValue);
      
      if (!isNaN(amountValue)) {
        // Map the comparison type to the appropriate filter key
        switch (localFilters.amountComparison) {
          case '>':
            filterCondition.amount__gt = amountValue;
            break;
          case '<':
            filterCondition.amount__lt = amountValue;
            break;
          case '=':
            filterCondition.amount = amountValue;
            break;
        }
      }
    }
    
    // Collect rule data
    const ruleData: TransactionRule = {
      filter_condition: filterCondition,
      category: category || undefined,
      flag_message: flagMessage || undefined
    };
    
    setIsSubmitting(true);
    
    // Execute the mutation with the rule data (always apply to all)
    createRuleMutation.mutate({
      rule: ruleData,
      applyToAll: true
    }, {
      onSuccess: () => {
        showNotification('success', 'Rule created and applied to all transactions');
        setShowRulePanel(false);
        setCategory('');
        setFlagMessage('');
        setIsSubmitting(false);
      },
      onError: (error) => {
        showNotification('error', error instanceof Error ? error.message : 'Failed to create rule');
        setIsSubmitting(false);
      }
    });
  };

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
        
        {isFiltersActive && (
          <button 
            className="inline-rule-button"
            onClick={() => setShowRulePanel(!showRulePanel)}
            title={showRulePanel ? "Hide rule form" : "Create a rule from current filters"}
          >
            {showRulePanel ? "Cancel Rule" : "Add Rule"}
          </button>
        )}
      </div>
      
      {showRulePanel && (
        <div className="inline-rule-panel">
          <div className="inline-rule-inputs">
            <div className="inline-rule-input-group">
              <input
                id="category-input"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Set category"
                className="inline-rule-input"
              />
            </div>
            
            <div className="inline-rule-input-group">
              <input
                id="flag-input"
                type="text"
                value={flagMessage}
                onChange={(e) => setFlagMessage(e.target.value)}
                placeholder="Add flag message"
                className="inline-rule-input"
              />
            </div>
            
            <button 
              className="inline-create-rule-button"
              onClick={handleCreateRule}
              disabled={isSubmitting || (!category && !flagMessage)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="inline-spinner-icon" size={14} />
                  Creating...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Create Rule
                </>
              )}
            </button>
          </div>
          <div className="inline-rule-hint">
            This rule will apply to all transactions matching your current filters
          </div>
        </div>
      )}
    </div>
  );
};
