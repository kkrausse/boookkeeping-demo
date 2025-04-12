import { useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData
} from '@tanstack/react-query';
import { 
  TransactionRule, 
  fetchTransactionRules, 
  createTransactionRule,
  updateTransactionRule,
  deleteTransactionRule,
  applyRuleToAll,
  applyAllRules,
  RuleApplyResponse,
  PaginatedResponse
} from '../api/transactions';
import { Edit, Trash2, Plus, Loader2, Play, PlayCircle } from 'lucide-react';
import { ActionInputs, ActionData } from '../components/ActionInputs';
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
  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<TransactionRule | null>(null);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  
  // New rule form state
  const [newRule, setNewRule] = useState<Partial<TransactionRule>>({
    filter_condition: {},
    category: '',
    flag_message: ''
  });
  
  // Fetch all rules
  const { data, isLoading } = useQuery<PaginatedResponse<TransactionRule>>({
    queryKey: ['rules'],
    queryFn: () => fetchTransactionRules().then(r => r.data),
    placeholderData: keepPreviousData
  });
  
  const rules = data?.results || [];
  
  // Create rule mutation
  const createMutation = useMutation({
    mutationFn: createTransactionRule,
    onSuccess: () => {
      setShowAddRule(false);
      showNotification('success', 'Rule created successfully');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: (error) => {
      showNotification('error', error instanceof Error ? error.message : 'Failed to create rule');
    }
  });
  
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
    setNewRule({
      filter_condition: {},
      category: '',
      flag_message: ''
    });
  };
  
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    
    // Clear notification after 3 seconds
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };
  
  const handleFormChange = (field: keyof TransactionRule, value: string) => {
    if (editingRule) {
      setEditingRule({
        ...editingRule,
        [field]: value
      });
    } else {
      setNewRule({
        ...newRule,
        [field]: value
      });
    }
  };

  // New function to handle filter condition changes
  const handleFilterConditionChange = (filterType: string, value: any) => {
    const rule = editingRule || newRule;
    const updatedCondition = { ...rule.filter_condition } || {};
    
    if (filterType === 'description' && value) {
      updatedCondition['description__icontains'] = value;
    } else if (filterType === 'description' && !value) {
      delete updatedCondition['description__icontains'];
    } else if (filterType === 'amount' && value.comparison && value.value) {
      // Map UI comparison to Django filter syntax
      const fieldMap = {
        'above': 'amount__gt',
        'below': 'amount__lt',
        'equal': 'amount'
      };
      
      const field = fieldMap[value.comparison as keyof typeof fieldMap] || '';
      if (field) {
        // Remove any existing amount filters
        Object.keys(updatedCondition).forEach(key => {
          if (key.startsWith('amount')) {
            delete updatedCondition[key];
          }
        });
        
        // Add the new filter
        updatedCondition[field] = parseFloat(value.value);
      }
    } else if (filterType === 'amount' && (!value.comparison || !value.value)) {
      // Remove any existing amount filters if either comparison or value is missing
      Object.keys(updatedCondition).forEach(key => {
        if (key.startsWith('amount')) {
          delete updatedCondition[key];
        }
      });
    }
    
    if (editingRule) {
      setEditingRule({
        ...editingRule,
        filter_condition: updatedCondition
      });
    } else {
      setNewRule({
        ...newRule,
        filter_condition: updatedCondition
      });
    }
  };
  
  const handleSaveRule = () => {
    const ruleData = editingRule || newRule;
    
    // Validate the rule
    const hasCondition = ruleData.filter_condition && 
      Object.keys(ruleData.filter_condition).length > 0;
      
    const hasAction = !!ruleData.category || !!ruleData.flag_message;
    
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
        ...ruleData,
        id: editingRule.id
      } as TransactionRule & { id: number });
    } else {
      createMutation.mutate(ruleData);
    }
  };
  
  const handleDeleteRule = (id: number) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      deleteMutation.mutate(id);
    }
  };
  
  const handleEditRule = (rule: TransactionRule) => {
    setEditingRule(rule);
    setShowAddRule(true);
  };
  
  const handleCancelEdit = () => {
    setEditingRule(null);
    setShowAddRule(false);
    resetForm();
  };
  
  const handleApplyRule = (id: number) => {
    applyRuleMutation.mutate(id);
  };
  
  const handleApplyAllRules = () => {
    applyAllRulesMutation.mutate();
  };
  
  const isPending = createMutation.isPending || updateMutation.isPending;
  
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
              setShowAddRule(!showAddRule);
              setEditingRule(null);
              resetForm();
            }}
            title={showAddRule ? "Cancel" : "Add new rule"}
          >
            <Plus size={18} />
            <span>Add Rule</span>
          </button>
        </div>
      </div>
      
      {showAddRule && (
        <div className="rule-form-container">
          <h3>{editingRule ? 'Edit Rule' : 'Create New Rule'}</h3>
          <div className="rule-form">
            <div className="form-section">
              <h4>Rule Conditions</h4>
              <div className="form-row">
                <label>
                  Description Contains:
                  <input 
                    type="text"
                    value={(editingRule?.filter_condition?.['description__icontains'] || 
                           newRule.filter_condition?.['description__icontains'] || '')}
                    onChange={(e) => handleFilterConditionChange('description', e.target.value)}
                    placeholder="Enter text to match in description"
                  />
                </label>
              </div>
              
              <div className="form-row">
                <label>
                  Amount:
                  <div className="amount-input-group">
                    <select 
                      value={
                        // Determine the comparison type from the filter_condition
                        Object.keys(editingRule?.filter_condition || newRule.filter_condition || {}).some(k => k === 'amount__gt') ? 'above' :
                        Object.keys(editingRule?.filter_condition || newRule.filter_condition || {}).some(k => k === 'amount__lt') ? 'below' :
                        Object.keys(editingRule?.filter_condition || newRule.filter_condition || {}).some(k => k === 'amount') ? 'equal' : ''
                      }
                      onChange={(e) => {
                        const amountValue = 
                          (editingRule?.filter_condition?.['amount__gt'] || 
                          editingRule?.filter_condition?.['amount__lt'] || 
                          editingRule?.filter_condition?.['amount'] ||
                          newRule.filter_condition?.['amount__gt'] || 
                          newRule.filter_condition?.['amount__lt'] || 
                          newRule.filter_condition?.['amount'] || '');
                        
                        handleFilterConditionChange('amount', {
                          comparison: e.target.value,
                          value: amountValue
                        });
                      }}
                    >
                      <option value="">Select comparison...</option>
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                      <option value="equal">Equal to</option>
                    </select>
                    <input 
                      type="number"
                      value={
                        // Get the amount value from the appropriate filter condition
                        (editingRule?.filter_condition?.['amount__gt'] || 
                         editingRule?.filter_condition?.['amount__lt'] || 
                         editingRule?.filter_condition?.['amount'] ||
                         newRule.filter_condition?.['amount__gt'] || 
                         newRule.filter_condition?.['amount__lt'] || 
                         newRule.filter_condition?.['amount'] || '')
                      }
                      onChange={(e) => {
                        const comparison = 
                          Object.keys(editingRule?.filter_condition || newRule.filter_condition || {}).some(k => k === 'amount__gt') ? 'above' :
                          Object.keys(editingRule?.filter_condition || newRule.filter_condition || {}).some(k => k === 'amount__lt') ? 'below' :
                          Object.keys(editingRule?.filter_condition || newRule.filter_condition || {}).some(k => k === 'amount') ? 'equal' : '';
                          
                        handleFilterConditionChange('amount', {
                          comparison,
                          value: e.target.value
                        });
                      }}
                      placeholder="Enter amount"
                      disabled={!Object.keys(editingRule?.filter_condition || newRule.filter_condition || {})
                        .some(k => ['amount__gt', 'amount__lt', 'amount'].includes(k))}
                    />
                  </div>
                </label>
              </div>
            </div>
            
            <div className="form-section">
              <h4>Rule Actions</h4>
              <ActionInputs
                onActionChange={(actionData) => {
                  // Update rule data when actions change
                  if (editingRule) {
                    setEditingRule({
                      ...editingRule,
                      category: actionData.category,
                      flag_message: actionData.flagMessage
                    });
                  } else {
                    setNewRule({
                      ...newRule,
                      category: actionData.category,
                      flag_message: actionData.flagMessage
                    });
                  }
                }}
                initialData={{
                  category: editingRule?.category || newRule.category || '',
                  flagMessage: editingRule?.flag_message || newRule.flag_message || ''
                }}
                showTitle={false}
                disabled={isPending}
              />
            </div>
            
            <div className="form-actions">
              <button 
                className="cancel-button"
                onClick={handleCancelEdit}
                disabled={isPending}
              >
                Cancel
              </button>
              <button 
                className="save-button"
                onClick={handleSaveRule}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="spinner-icon" size={16} />
                    Saving...
                  </>
                ) : (
                  'Save Rule'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="transaction-table-container">
        <table className="transaction-table">
          <thead>
            <tr>
              <th>Conditions</th>
              <th>Actions</th>
              <th>Created</th>
              <th className="actions-column">Actions</th>
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
                <tr key={rule.id}>
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
                    <button
                      className="icon-button edit-button"
                      onClick={() => handleEditRule(rule)}
                      title="Edit rule"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      className="icon-button apply-button"
                      onClick={() => rule.id && handleApplyRule(rule.id)}
                      disabled={applyRuleMutation.isPending}
                      title="Apply rule to all transactions"
                    >
                      <Play size={18} />
                    </button>
                    <button
                      className="icon-button delete-button"
                      onClick={() => rule.id && handleDeleteRule(rule.id)}
                      title="Delete rule"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
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
