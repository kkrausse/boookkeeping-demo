import React, { useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData
} from '@tanstack/react-query';
import { 
  TransactionRule, 
  fetchTransactionRules, 
  updateTransactionRule,
  deleteTransactionRule,
  applyRuleToAll,
  applyAllRules,
  RuleApplyResponse,
  PaginatedResponse,
  FilterParams,
  FilterCondition
} from '../api/transactions';
import { Edit, Trash2, Plus, Loader2, Play, Check, X } from 'lucide-react';
import { FilterInlinePanel } from '../components/FilterInlinePanel';
import '../components/TransactionTable.css';

// Helper component for rule action rendering
const RuleActionSummary = ({ rule }: { rule: TransactionRule }) => {
  const actions = [];
  
  if (rule.category) {
    actions.push(`Set category to "${rule.category}"`);
  }
  
  if (rule.flag_message) {
    actions.push(`Add flag: "${rule.flag_message}"`);
  }
  
  return (
    <div className="rule-actions-summary">
      {actions.map((action, index) => (
        <div key={index} className="rule-action-item">{action}</div>
      ))}
    </div>
  );
};

// Helper component for rule condition rendering
const RuleConditionSummary = ({ rule }: { rule: TransactionRule }) => {
  const conditions = [];
  
  if (rule.filter_condition) {
    Object.entries(rule.filter_condition).forEach(([key, value]) => {
      // Parse the Django-style filter syntax
      if (key.endsWith('__icontains')) {
        const field = key.replace('__icontains', '');
        conditions.push(`${field} contains "${value}"`);
      } else if (key.endsWith('__contains')) {
        const field = key.replace('__contains', '');
        conditions.push(`${field} contains "${value}" (case sensitive)`);
      } else if (key.endsWith('__gt')) {
        const field = key.replace('__gt', '');
        conditions.push(`${field} > ${value}`);
      } else if (key.endsWith('__lt')) {
        const field = key.replace('__lt', '');
        conditions.push(`${field} < ${value}`);
      } else if (key.endsWith('__gte')) {
        const field = key.replace('__gte', '');
        conditions.push(`${field} >= ${value}`);
      } else if (key.endsWith('__lte')) {
        const field = key.replace('__lte', '');
        conditions.push(`${field} <= ${value}`);
      } else if (key.endsWith('__exact')) {
        const field = key.replace('__exact', '');
        conditions.push(`${field} = ${value}`);
      } else {
        conditions.push(`${key} = ${value}`);
      }
    });
  }
  
  // Legacy support
  if (rule.filter_description) {
    conditions.push(`Description contains "${rule.filter_description}"`);
  }
  
  if (rule.filter_amount_value && rule.filter_amount_comparison) {
    const comparisonText = {
      'above': 'greater than',
      'below': 'less than',
      'equal': 'equal to'
    }[rule.filter_amount_comparison as 'above' | 'below' | 'equal'] || '';
    
    conditions.push(`Amount is ${comparisonText} ${rule.filter_amount_value}`);
  }
  
  return (
    <div className="rule-conditions-summary">
      {conditions.map((condition, index) => (
        <div key={index} className="rule-condition-item">{condition}</div>
      ))}
    </div>
  );
};

export function RulesPage() {
  const queryClient = useQueryClient();
  const [editingRule, setEditingRule] = useState<TransactionRule | null>(null);
  const [showAddRuleForm, setShowAddRuleForm] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  
  // Filter state for the inline filter panel
  const [filters, setFilters] = useState<FilterParams>({
    description: '',
    amountValue: '',
    amountComparison: '>'
  });
  
  // Fetch all rules
  const { data, isLoading } = useQuery<PaginatedResponse<TransactionRule>>({
    queryKey: ['rules'],
    queryFn: () => fetchTransactionRules().then(r => r.data),
    placeholderData: keepPreviousData
  });
  
  const rules = data?.results || [];
  
  // This mutation has been replaced by the FilterInlinePanel component's internal mutation
  
  // Update rule mutation
  const updateMutation = useMutation({
    mutationFn: updateTransactionRule,
    onSuccess: () => {
      setEditingRule(null);
      showNotification('success', 'Rule updated successfully');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: (error) => {
      showNotification('error', error instanceof Error ? error.message : 'Failed to update rule');
    }
  });
  
  // Delete rule mutation
  const deleteMutation = useMutation({
    mutationFn: deleteTransactionRule,
    onSuccess: () => {
      showNotification('success', 'Rule deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: (error) => {
      showNotification('error', error instanceof Error ? error.message : 'Failed to delete rule');
    }
  });
  
  // Apply rule to all transactions mutation
  const applyRuleMutation = useMutation({
    mutationFn: applyRuleToAll,
    onSuccess: (data: RuleApplyResponse) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showNotification('success', `Rule applied to ${data.updated_count} transactions`);
    },
    onError: (error) => {
      showNotification('error', error instanceof Error ? error.message : 'Failed to apply rule');
    }
  });
  
  // Apply all rules to all transactions mutation
  const applyAllRulesMutation = useMutation({
    mutationFn: applyAllRules,
    onSuccess: (data: RuleApplyResponse) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showNotification('success', `All rules applied to ${data.updated_count} transactions`);
    },
    onError: (error) => {
      showNotification('error', error instanceof Error ? error.message : 'Failed to apply rules');
    }
  });
  
  const resetForm = () => {
    // Clear filters for the inline panel
    clearFilters();
    setEditingRule(null);
  };
  
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    
    // Clear notification after 3 seconds
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };
  
  // Function to check if any filters are active
  const isFiltersActive = () => {
    return !!(filters.description || (filters.amountValue && filters.amountComparison));
  };
  
  // Function to clear all filters
  const clearFilters = () => {
    setFilters({
      description: '',
      amountValue: '',
      amountComparison: '>'
    });
  };
  
  // These functions have been replaced by FilterInlinePanel's internal handlers
  
  const handleSaveRule = () => {
    // Validate the rule
    const hasCondition = editingRule?.filter_condition && 
      Object.keys(editingRule.filter_condition).length > 0;
      
    const hasAction = !!editingRule?.category || !!editingRule?.flag_message;
    
    if (!hasCondition) {
      showNotification('error', 'Please specify at least one condition');
      return;
    }
    
    if (!hasAction) {
      showNotification('error', 'Please specify at least one action');
      return;
    }
    
    if (editingRule && editingRule.id) {
      updateMutation.mutate({
        ...editingRule,
        id: editingRule.id
      } as TransactionRule & { id: number });
    }
  };
  
  const handleDeleteRule = (id: number) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      deleteMutation.mutate(id);
    }
  };
  
  const handleEditRule = (rule: TransactionRule) => {
    setEditingRule(rule);
    setShowAddRuleForm(false);
  };
  
  const handleCancelEdit = () => {
    setEditingRule(null);
    setShowAddRuleForm(false);
    resetForm();
  };
  
  const handleApplyRule = (id: number) => {
    applyRuleMutation.mutate(id);
  };
  
  const handleApplyAllRules = () => {
    applyAllRulesMutation.mutate();
  };
  
  const isPending = updateMutation.isPending || applyRuleMutation.isPending || applyAllRulesMutation.isPending;
  
  const totalRules = data?.count || 0;

  return (
    <div className="page-container">

      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      
      <div className="rules-info">Total Rules: {totalRules}</div>
      
      <div className="table-header">
        <h2>Rules</h2>
        <div className="table-actions">
          <button
            className="add-button"
            onClick={() => {
              setEditingRule(null);
              setShowAddRuleForm(!showAddRuleForm);
              if (!showAddRuleForm) {
                resetForm();
              }
            }}
            title={showAddRuleForm ? "Cancel" : "Add new rule"}
          >
            <Plus size={18} />
            <span>{showAddRuleForm ? "Cancel" : "Add Rule"}</span>
          </button>
        </div>
      </div>
      
      {/* Show the FilterInlinePanel form only when Add Rule is clicked */}
      {showAddRuleForm && !editingRule && (
        <div className="rule-form-container">
          <div className="filter-rule-container">
            <FilterInlinePanel
              onSubmit={() => {
                console.log('kill this shit')
              setEditingRule(null);
              setShowAddRuleForm(null);
              resetForm();
                clearFilters();
            }}
              filters={filters}
              onFilterChange={setFilters}
              isFiltersActive={isFiltersActive()}
              clearFilters={clearFilters}
              showNotification={showNotification}
              alwaysShowRulePanel={true}
            />
          </div>
        </div>
      )}
      
      {/* The edit form will be rendered inside the table */}
      
      <div className="transaction-table-container">
        <table className="transaction-table">
          <thead>
            <tr>
              <th>Conditions</th>
              <th>Actions</th>
              <th>Created</th>
              <th className="edit-column">Edit</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr className="loading-row">
                <td colSpan={4}>
                  <div className="loading-message">
                    <Loader2 className="spinner-icon" size={24} />
                    <span>Loading rules...</span>
                  </div>
                </td>
              </tr>
            ) : rules.length > 0 ? (
              rules.map(rule => (
                <React.Fragment key={rule.id}>
                  <tr>
                    <td>
                      <RuleConditionSummary rule={rule} />
                    </td>
                    <td>
                      <RuleActionSummary rule={rule} />
                    </td>
                    <td>
                      {rule.created_at ? new Date(rule.created_at).toLocaleString() : ''}
                    </td>
                    <td className="action-buttons">
                      {editingRule && editingRule.id === rule.id ? (
                        <>
                          <button
                            className="icon-button save-button"
                            onClick={handleSaveRule}
                            disabled={isPending}
                            title="Save changes"
                          >
                            {isPending ? (
                              <Loader2 className="spinner-icon" size={18} />
                            ) : (
                              <Check size={18} />
                            )}
                          </button>
                          <button
                            className="icon-button cancel-button"
                            onClick={handleCancelEdit}
                            disabled={isPending}
                            title="Cancel"
                          >
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="icon-button edit-button"
                            onClick={() => handleEditRule(rule)}
                            title="Edit rule"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            className="icon-button delete-button"
                            onClick={() => rule.id && handleDeleteRule(rule.id)}
                            title="Delete rule"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {editingRule && editingRule.id === rule.id && (
                    <tr className="rule-form-container edit-rule-row">
                      <td colSpan={4}>
                        <div className="edit-rule-container">
                          <h3>Edit Rule</h3>
                          <div className="filter-rule-container">
                            <FilterInlinePanel
                              filters={{
                                taco: editingRule,
                                description: editingRule.filter_condition?.description__icontains || '',
                                amountValue: String(
                                  editingRule.filter_condition?.amount__gt ??
                                    editingRule.filter_condition?.amount__lt ??
                                    editingRule.filter_condition?.amount ??
                                    ''),
                                amountComparison: Object.keys(editingRule.filter_condition || {}).some(k => k === 'amount__gt') ? '>' :
                                              Object.keys(editingRule.filter_condition || {}).some(k => k === 'amount__lt') ? '<' :
                                              Object.keys(editingRule.filter_condition || {}).some(k => k === 'amount') ? '=' : '>'
                              }}
                              onFilterChange={(newFilters) => {
                                // Create a function to handle the update to avoid inline complexity
                                const updateRuleFilters = () => {
                                  const updatedCondition: FilterCondition = { ...editingRule.filter_condition } || {};
                                  
                                  // Update description filter
                                  if (newFilters.description) {
                                    updatedCondition.description__icontains = newFilters.description;
                                  } else {
                                    delete updatedCondition.description__icontains;
                                  }
                                  
                                  // Update amount filters
                                  Object.keys(updatedCondition).forEach(key => {
                                    if (key.startsWith('amount')) {
                                      delete updatedCondition[key as keyof FilterCondition];
                                    }
                                  });
                                  
                                  if (newFilters.amountValue && newFilters.amountComparison) {
                                    const amountValue = parseFloat(newFilters.amountValue);
                                    
                                    if (!isNaN(amountValue)) {
                                      switch (newFilters.amountComparison) {
                                        case '>':
                                          updatedCondition.amount__gt = amountValue;
                                          break;
                                        case '<':
                                          updatedCondition.amount__lt = amountValue;
                                          break;
                                        case '=':
                                          updatedCondition.amount = amountValue;
                                          break;
                                      }
                                    }
                                  }
                                  
                                  // Check if there are actual changes to prevent loops
                                  const currentDesc = editingRule.filter_condition?.description__icontains || '';
                                  const currentAmountGt = editingRule.filter_condition?.amount__gt;
                                  const currentAmountLt = editingRule.filter_condition?.amount__lt;
                                  const currentAmount = editingRule.filter_condition?.amount;
                                  
                                  const hasDescriptionChange = 
                                    (updatedCondition.description__icontains || '') !== currentDesc;
                                    
                                  const hasAmountChange = 
                                    updatedCondition.amount__gt !== currentAmountGt ||
                                    updatedCondition.amount__lt !== currentAmountLt ||
                                    updatedCondition.amount !== currentAmount;
                                    
                                  if (hasDescriptionChange || hasAmountChange) {
                                    setEditingRule({
                                      ...editingRule,
                                      filter_condition: updatedCondition
                                    });
                                  }
                                };
                                
                                updateRuleFilters();
                              }}
                              isFiltersActive={true}
                              clearFilters={() => {
                                setEditingRule({
                                  ...editingRule,
                                  filter_condition: {}
                                });
                              }}
                              showNotification={showNotification}
                              alwaysShowRulePanel={true}
                              initialCategory={editingRule.category}
                              initialFlagMessage={editingRule.flag_message}
                              onActionChange={(category, flagMessage) => {
                                // Only update if values actually changed to prevent loops
                                if (category !== editingRule.category || 
                                    flagMessage !== editingRule.flag_message) {
                                  setEditingRule({
                                    ...editingRule,
                                    category: category || undefined,
                                    flag_message: flagMessage || undefined
                                  });
                                }
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  <div className="no-results-message">
                    No rules found. Click the "Add Rule" button to create one.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
