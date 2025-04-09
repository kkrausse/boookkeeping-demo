import React, { useState, useEffect } from 'react';
import { FilterParams, TransactionRule, createTransactionRule } from '../api/transactions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Check, Save, Loader2 } from 'lucide-react';
import { ActionInputs, ActionData } from './ActionInputs';
import './FilterPanel.css';

type AmountComparisonType = 'above' | 'below' | 'equal' | '';

type FilterPanelProps = {
  filters: FilterParams;
  onFilterChange: (filters: FilterParams) => void;
  isFiltersActive: boolean;
  clearFilters: () => void;
  showNotification: (type: 'success' | 'error', message: string) => void;
};

// We're using ActionData from ActionInputs component

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFilterChange,
  isFiltersActive,
  clearFilters,
  showNotification,
}) => {
  const queryClient = useQueryClient();
  const [localFilters, setLocalFilters] = useState<FilterParams>({
    description: filters.description || '',
    amountValue: filters.amountValue || '',
    amountComparison: filters.amountComparison || ''
  });

  // Rule creation state
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [actionData, setActionData] = useState<ActionData>({});

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
        onFilterChange(localFilters);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [localFilters, filters, onFilterChange]);

  // Toggle rule creation mode
  const toggleRuleCreation = () => {
    setIsAddingRule(!isAddingRule);
    // Reset action data when toggling
    if (!isAddingRule) {
      setActionData({});
    }
  };

  // Handle changes to action inputs
  const handleActionChange = (newActionData: ActionData) => {
    setActionData(newActionData);
  };

  // Create rule mutation
  const createRuleMutation = useMutation({
    mutationFn: createTransactionRule,
    onSuccess: (data) => {
      // Show success notification
      showNotification('success', `Rule created successfully`);
      
      // Reset rule creation state
      setIsAddingRule(false);
      setActionData({});
      
      // Invalidate rules queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: (error) => {
      // Show error notification
      showNotification('error', error instanceof Error ? error.message : 'Failed to create rule');
    }
  });

  // Submit the rule creation
  const handleCreateRule = () => {
    // Collect rule data
    const ruleData: TransactionRule = {
      // Apply the filter criteria from the local filters
      filter_description: localFilters.description || undefined,
      filter_amount_value: localFilters.amountValue || undefined,
      filter_amount_comparison: localFilters.amountComparison || undefined,
      // Add rule actions from actionData
      category: actionData.category,
      flag_message: actionData.flagMessage
    };

    // Check if we have at least one rule action selected
    if (!ruleData.category && !ruleData.flag_message) {
      showNotification('error', 'Please select at least one rule action (category or flag)');
      return;
    }
    
    // Check if we have at least one filter criterion
    if (!ruleData.filter_description && 
        !(ruleData.filter_amount_value && ruleData.filter_amount_comparison)) {
      showNotification('error', 'Please provide at least one filter criterion');
      return;
    }

    // Execute the mutation
    createRuleMutation.mutate(ruleData);
  };

  return (
    <div className="filter-panel">
      <div className="filter-header">
        <div className="filter-actions">
          <button 
            className="rule-button"
            onClick={toggleRuleCreation}
            title={isAddingRule ? "Back to filters" : "Add rule"}
          >
            {isAddingRule ? "Back to Filters" : "Add Rule"}
          </button>
          {!isAddingRule && (
            <button 
              className="clear-filters-button"
              onClick={clearFilters}
              disabled={!isFiltersActive}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {!isAddingRule ? (
        // Standard filter controls
        <div className="filter-controls">
          <div className="filter-group">
            <label htmlFor="description-filter">Description Contains:</label>
            <input
              id="description-filter"
              type="text"
              value={localFilters.description}
              onChange={(e) => handleLocalFilterChange('description', e.target.value)}
              placeholder="Enter text to search"
              className="filter-input"
            />
          </div>
          <div className="filter-group">
            <label htmlFor="amount-filter">Amount:</label>
            <div className="amount-filter-controls">
              <select
                value={localFilters.amountComparison}
                onChange={(e) => handleLocalFilterChange('amountComparison', e.target.value as AmountComparisonType)}
                className="filter-select"
              >
                <option value="">Select...</option>
                <option value="above">Above</option>
                <option value="below">Below</option>
                <option value="equal">Equal to</option>
              </select>
              <input
                id="amount-filter"
                type="number"
                value={localFilters.amountValue}
                onChange={(e) => handleLocalFilterChange('amountValue', e.target.value)}
                placeholder="Enter amount"
                className="filter-input"
                disabled={!localFilters.amountComparison}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="rule-creation">
          <div className="rule-description">
            <p>Create a rule to automatically categorize or flag transactions:</p>
          </div>
          
          <div className="rule-section">
            <h4>1. Define Filter Criteria</h4>
            <p className="rule-section-description">Specify which transactions this rule will apply to:</p>
            <div className="filter-controls">
              <div className="filter-group">
                <label htmlFor="description-filter">Description Contains:</label>
                <input
                  id="description-filter"
                  type="text"
                  value={localFilters.description}
                  onChange={(e) => handleLocalFilterChange('description', e.target.value)}
                  placeholder="Enter text to match in description"
                  className="filter-input"
                />
              </div>
              <div className="filter-group">
                <label htmlFor="amount-filter">Amount:</label>
                <div className="amount-filter-controls">
                  <select
                    value={localFilters.amountComparison}
                    onChange={(e) => handleLocalFilterChange('amountComparison', e.target.value as AmountComparisonType)}
                    className="filter-select"
                  >
                    <option value="">Select...</option>
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                    <option value="equal">Equal to</option>
                  </select>
                  <input
                    id="amount-filter"
                    type="number"
                    value={localFilters.amountValue}
                    onChange={(e) => handleLocalFilterChange('amountValue', e.target.value)}
                    placeholder="Enter amount"
                    className="filter-input"
                    disabled={!localFilters.amountComparison}
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="rule-section">
            <h4>2. Define Actions to Apply</h4>
            <p className="rule-section-description">Specify what should happen when a transaction matches:</p>
            <ActionInputs
              onActionChange={handleActionChange}
              showTitle={false}
              disabled={createRuleMutation.isPending}
            />
          </div>
          
          <div className="rule-actions">
            <button 
              className="create-rule-button"
              onClick={handleCreateRule}
              disabled={createRuleMutation.isPending || (!actionData.category && !actionData.flagMessage)}
            >
              {createRuleMutation.isPending ? (
                <>
                  <Loader2 className="spinner-icon" size={16} />
                  Creating...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Create Rule
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
