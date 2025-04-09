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
    filter_description: '',
    filter_amount_value: '',
    filter_amount_comparison: '',
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
      filter_description: '',
      filter_amount_value: '',
      filter_amount_comparison: '',
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
  
  const handleSaveRule = () => {
    const ruleData = editingRule || newRule;
    
    // Validate the rule
    const hasCondition = !!ruleData.filter_description || 
      !!(ruleData.filter_amount_value && ruleData.filter_amount_comparison);
      
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
      <h1>Transaction Rules</h1>
      
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
            className="apply-all-button"
            onClick={handleApplyAllRules}
            disabled={applyAllRulesMutation.isPending || rules.length === 0}
            title="Apply all rules to all transactions"
          >
            <PlayCircle size={18} />
            <span>Apply All Rules</span>
            {applyAllRulesMutation.isPending && <Loader2 className="spinner-icon" size={16} />}
          </button>
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
                    value={editingRule?.filter_description || newRule.filter_description || ''}
                    onChange={(e) => handleFormChange('filter_description', e.target.value)}
                    placeholder="Enter text to match in description"
                  />
                </label>
              </div>
              
              <div className="form-row">
                <label>
                  Amount:
                  <div className="amount-input-group">
                    <select 
                      value={editingRule?.filter_amount_comparison || newRule.filter_amount_comparison || ''}
                      onChange={(e) => handleFormChange('filter_amount_comparison', e.target.value)}
                    >
                      <option value="">Select comparison...</option>
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                      <option value="equal">Equal to</option>
                    </select>
                    <input 
                      type="number"
                      value={editingRule?.filter_amount_value || newRule.filter_amount_value || ''}
                      onChange={(e) => handleFormChange('filter_amount_value', e.target.value)}
                      placeholder="Enter amount"
                      disabled={!(editingRule?.filter_amount_comparison || newRule.filter_amount_comparison)}
                    />
                  </div>
                </label>
              </div>
            </div>
            
            <div className="form-section">
              <h4>Rule Actions</h4>
              <div className="form-row">
                <label>
                  Set Category:
                  <input 
                    type="text"
                    value={editingRule?.category || newRule.category || ''}
                    onChange={(e) => handleFormChange('category', e.target.value)}
                    placeholder="Enter category name"
                  />
                </label>
              </div>
              
              <div className="form-row">
                <label>
                  Add Flag:
                  <input 
                    type="text"
                    value={editingRule?.flag_message || newRule.flag_message || ''}
                    onChange={(e) => handleFormChange('flag_message', e.target.value)}
                    placeholder="Enter flag message"
                  />
                </label>
              </div>
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