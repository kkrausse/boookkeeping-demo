import React, { useState, useEffect, useRef } from 'react';
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
  alwaysShowRulePanel?: boolean; // Prop to control rule panel visibility
  initialCategory?: string; // Initial category value for editing
  initialFlagMessage?: string; // Initial flag message for editing
  onActionChange?: (category: string, flagMessage: string) => void; // Callback for action changes when editing
};

export const FilterInlinePanel: React.FC<FilterInlinePanelProps> = ({
  filters,
  onFilterChange,
  isFiltersActive,
  clearFilters,
  showNotification,
  totalCount,
  flagCount,
  alwaysShowRulePanel = false, // Default to false for backward compatibility
  initialCategory = '',
  initialFlagMessage = '',
  onActionChange
}) => {
  const [localFilters, setLocalFilters] = useState<FilterParams>({
    description: filters.description || '',
    amountValue: filters.amountValue || '',
    amountComparison: filters.amountComparison || ''
  });
  
  // Ref to track initial render for various effects
  const isInitialRender = useRef(true);
  
  const [showRulePanel, setShowRulePanel] = useState(alwaysShowRulePanel);
  const [category, setCategory] = useState(initialCategory);
  const [flagMessage, setFlagMessage] = useState(initialFlagMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const queryClient = useQueryClient();
  const createRuleMutation = useCreateTransactionRule({
    pollingInterval: 1000, // 1 second polling interval for real-time updates
  });
  
  // Set isInitialRender to false after the first render
  useEffect(() => {
    isInitialRender.current = false;
  }, []);
  
  // Update showRulePanel when alwaysShowRulePanel prop changes
  useEffect(() => {
    if (alwaysShowRulePanel) {
      setShowRulePanel(true);
    }
  }, [alwaysShowRulePanel]);
  
  // Update category and flag message when props change (for editing)
  // Use refs to prevent unnecessary updates
  const initialCategoryRef = React.useRef(initialCategory);
  const initialFlagMessageRef = React.useRef(initialFlagMessage);

  useEffect(() => {
    // Only update state if props actually changed from their previous values
    if (initialCategoryRef.current !== initialCategory) {
      setCategory(initialCategory);
      initialCategoryRef.current = initialCategory;
    }
    
    if (initialFlagMessageRef.current !== initialFlagMessage) {
      setFlagMessage(initialFlagMessage);
      initialFlagMessageRef.current = initialFlagMessage;
    }
  }, [initialCategory, initialFlagMessage]);

  // Update local filters when props change
  const filtersRef = useRef(filters);
  
  useEffect(() => {
    // Deep compare filters to avoid unnecessary updates
    const filterChanged = 
      filtersRef.current.description !== filters.description ||
      filtersRef.current.amountValue !== filters.amountValue ||
      filtersRef.current.amountComparison !== filters.amountComparison;
    
    if (filterChanged) {
      setLocalFilters({
        description: filters.description || '',
        amountValue: filters.amountValue || '',
        amountComparison: filters.amountComparison || ''
      });
      filtersRef.current = {...filters};
    }
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
    // Skip first render
    if (isInitialRender.current) {
      return;
    }
    
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
  
  // Close rule panel when filters are cleared, unless alwaysShowRulePanel is true
  useEffect(() => {
    if (!alwaysShowRulePanel && !isFiltersActive && showRulePanel) {
      setShowRulePanel(false);
    }
  }, [isFiltersActive, showRulePanel, alwaysShowRulePanel]);
  
  // Call the onActionChange callback when category or flag message changes (for editing)
  // We use refs to track previous values to detect actual changes
  const prevCategory = React.useRef(category);
  const prevFlagMessage = React.useRef(flagMessage);
  
  useEffect(() => {
    // Skip the callback on initial render or when the change came from props
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    
    // Only call the callback if the values changed due to user action
    // and not due to prop changes
    const categoryChanged = prevCategory.current !== category;
    const flagMessageChanged = prevFlagMessage.current !== flagMessage;
    
    if ((categoryChanged || flagMessageChanged) && onActionChange) {
      onActionChange(category, flagMessage);
    }
    
    // Update refs for next comparison
    prevCategory.current = category;
    prevFlagMessage.current = flagMessage;
  }, [category, flagMessage, onActionChange]);

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
          <div className="total-count">Total: {totalCount}, </div>
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
              placeholder="Description contains words..."
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
        
        {isFiltersActive && !alwaysShowRulePanel && (
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
            
            {!onActionChange && (
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
            )}
          </div>
          {!onActionChange && (
            <div className="inline-rule-hint">
              This rule will apply to all transactions matching your current filters
            </div>
          )}
        </div>
      )}
    </div>
  );
};
