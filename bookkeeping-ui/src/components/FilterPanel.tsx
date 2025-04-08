import React, { useState, useEffect } from 'react';
import { FilterParams, TransactionRule, createTransactionRule } from '../api/transactions';
import { PlusCircle, Check, Save, Loader2 } from 'lucide-react';
import './FilterPanel.css';

type AmountComparisonType = 'above' | 'below' | 'equal' | '';

type FilterPanelProps = {
  filters: FilterParams;
  onFilterChange: (filters: FilterParams) => void;
  isFiltersActive: boolean;
  clearFilters: () => void;
};

// Define a type for rule options
interface RuleOption {
  id: string;
  label: string;
  checked: boolean;
  value?: string;
}

// Define the rules data we'll collect
interface RuleData {
  category?: string;
  flagMessage?: string;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFilterChange,
  isFiltersActive,
  clearFilters,
}) => {
  const [localFilters, setLocalFilters] = useState<FilterParams>({
    description: filters.description || '',
    amountValue: filters.amountValue || '',
    amountComparison: filters.amountComparison || ''
  });

  // Rule creation state
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [ruleOptions, setRuleOptions] = useState<RuleOption[]>([
    { id: 'category', label: 'Add Category', checked: false, value: '' },
    { id: 'flag', label: 'Add Flag', checked: false, value: '' }
  ]);

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
    // Reset rule options when toggling
    if (!isAddingRule) {
      setRuleOptions([
        { id: 'category', label: 'Add Category', checked: false, value: '' },
        { id: 'flag', label: 'Add Flag', checked: false, value: '' }
      ]);
    }
  };

  // Handle changes to rule options
  const handleRuleOptionChange = (id: string, checked: boolean) => {
    setRuleOptions(prev => 
      prev.map(option => 
        option.id === id ? { ...option, checked } : option
      )
    );
  };

  // Handle changes to rule option values
  const handleRuleValueChange = (id: string, value: string) => {
    setRuleOptions(prev => 
      prev.map(option => 
        option.id === id ? { ...option, value } : option
      )
    );
  };

  // Submit the rule creation
  const handleCreateRule = async () => {
    // Collect rule data
    const ruleData: TransactionRule = {};
    
    ruleOptions.forEach(option => {
      if (option.checked && option.value) {
        if (option.id === 'category') {
          ruleData.category = option.value;
        } else if (option.id === 'flag') {
          ruleData.flagMessage = option.value;
        }
      }
    });

    // Check if we have at least one rule option selected
    if (!Object.keys(ruleData).length) {
      alert('Please select at least one rule option and provide a value.');
      return;
    }

    try {
      setIsCreatingRule(true);
      
      // Call the API to create the rule
      const createdRule = await createTransactionRule(ruleData);
      console.log('Rule created successfully:', createdRule);
      
      // Show success message
      alert(`Rule created successfully with ID: ${createdRule.id}`);
      
      // Reset rule creation state
      setIsAddingRule(false);
      setRuleOptions([
        { id: 'category', label: 'Add Category', checked: false, value: '' },
        { id: 'flag', label: 'Add Flag', checked: false, value: '' }
      ]);
    } catch (error) {
      console.error('Error creating rule:', error);
      alert('Failed to create rule. Please try again.');
    } finally {
      setIsCreatingRule(false);
    }
  };

  return (
    <div className="filter-panel">
      <div className="filter-header">
        <h3>{isAddingRule ? 'Create Transaction Rule' : 'Filter Transactions'}</h3>
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
        // Rule creation controls
        <div className="rule-creation">
          <div className="rule-description">
            <p>Create a rule to automatically categorize or flag transactions:</p>
          </div>
          <div className="rule-options">
            {ruleOptions.map(option => (
              <div key={option.id} className="rule-option">
                <div className="rule-option-header">
                  <label className="rule-checkbox-label">
                    <input
                      type="checkbox"
                      checked={option.checked}
                      onChange={(e) => handleRuleOptionChange(option.id, e.target.checked)}
                    />
                    {option.label}
                  </label>
                </div>
                {option.checked && (
                  <input
                    type="text"
                    value={option.value || ''}
                    onChange={(e) => handleRuleValueChange(option.id, e.target.value)}
                    placeholder={option.id === 'category' ? "Enter category name" : "Enter flag message"}
                    className="rule-input"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="rule-actions">
            <button 
              className="create-rule-button"
              onClick={handleCreateRule}
              disabled={isCreatingRule || !ruleOptions.some(option => option.checked && option.value)}
            >
              {isCreatingRule ? (
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