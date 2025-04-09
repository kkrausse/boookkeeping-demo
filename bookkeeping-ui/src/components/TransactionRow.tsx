import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, TransactionFlag, resolveTransactionFlag } from '../api/transactions';
import { Check, X, Edit, Trash2, Info, Loader2, XCircle, CheckCircle } from 'lucide-react';

interface TransactionRowProps {
  transaction: Transaction | null; // null for new transaction
  isNew?: boolean;
  onSaveNew?: (transaction: Partial<Transaction>) => void;
  onCancel?: () => void;
  onDelete?: (id: number) => void;
  onUpdateTransaction?: (transaction: Partial<Transaction> & { id: number }) => Promise<any>;
  editableFields?: Array<keyof Transaction>;
  showNotification: (type: 'success' | 'error', message: string) => void;
}

export const TransactionRow: React.FC<TransactionRowProps> = ({
  transaction,
  isNew = false,
  onSaveNew,
  onCancel,
  onDelete,
  onUpdateTransaction,
  editableFields = ['description', 'category', 'amount', 'datetime'],
  showNotification,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(isNew);
  const [expandedDetails, setExpandedDetails] = useState<boolean>(false);
  // For editing mode, we need to track changes before saving
  const [editValues, setEditValues] = useState<Partial<Transaction>>({});
  
  // Track which flags are currently being resolved
  const [resolvingFlags, setResolvingFlags] = useState<Set<number>>(new Set());
  
  // Track resolved flags in local state (server will delete them, this is for UI only)
  const [localResolvedFlags, setLocalResolvedFlags] = useState<TransactionFlag[]>([]);
  
  // Reset edit values when transaction changes or when entering edit mode
  useEffect(() => {
    if (isNew || isEditing) {
      // Start with a clean slate when entering edit mode
      setEditValues({});
    }
  }, [isNew, isEditing, transaction]);

  // Track loading state for update operations
  const [isUpdating, setIsUpdating] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (isNew && onSaveNew) {
      // For new transactions, combine default values with edited values
      const newTransaction: Partial<Transaction> = {
        description: '',
        category: '',
        amount: '',
        datetime: new Date().toISOString(),
        ...editValues
      };
      onSaveNew(newTransaction);
      return;
    }
    
    if (transaction && onUpdateTransaction && Object.keys(editValues).length > 0) {
      setIsUpdating(true);
      try {
        // Only update with the fields that changed
        await onUpdateTransaction({
          id: transaction.id,
          ...editValues,
        });
        
        // On success
        setIsEditing(false);
      } catch (error) {
        // On error
        showNotification('error', error instanceof Error ? error.message : 'Failed to update transaction');
      } finally {
        setIsUpdating(false);
        // Clear edit values after update
        setEditValues({});
      }
    } else {
      // No changes to save
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    if (isNew && onCancel) {
      onCancel();
      return;
    }
    
    // Clear edit values and exit edit mode
    setEditValues({});
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (!transaction) return;
    
    if (onDelete && confirm('Are you sure you want to delete this transaction?')) {
      onDelete(transaction.id);
    }
  };

  const handleInputChange = (field: keyof Transaction, value: string) => {
    setEditValues(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Handle resolving (deleting) a flag
  const handleResolveFlag = async (flag: TransactionFlag) => {
    if (!transaction || !transaction.id || !flag?.id) return;
    
    const flagId = flag.id;
    
    // Mark this flag as resolving (for loading state)
    setResolvingFlags(prev => {
      const newSet = new Set(prev);
      newSet.add(flagId);
      return newSet;
    });
    
    try {
      // Call the API to resolve the flag
      await resolveTransactionFlag(transaction.id, flagId);
      
      // Store a copy of the resolved flag to show in the UI
      setLocalResolvedFlags(prev => [...prev, { ...flag, id: undefined }]);
      
      showNotification('success', 'Flag resolved successfully');
      
      // Refresh the transaction (the onUpdateTransaction callback will trigger a refetch)
      if (onUpdateTransaction) {
        await onUpdateTransaction({ id: transaction.id });
      }
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to resolve flag');
    } finally {
      // Remove the resolving state
      setResolvingFlags(prev => {
        const newSet = new Set(prev);
        newSet.delete(flagId);
        return newSet;
      });
    }
  };

  const isFieldEditable = (field: keyof Transaction) => {
    return editableFields.includes(field);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  const formatAmount = (amount: string | null | undefined) => {
    // Check if amount is null, undefined, empty string or not a valid number
    if (amount === null || amount === undefined || amount === '' || isNaN(parseFloat(amount))) {
      return '-';
    }
    
    const numAmount = parseFloat(amount);
    return numAmount.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    });
  };

  const getAmountClass = (amount: string | null | undefined) => {
    if (amount === null || amount === undefined || amount === '' || isNaN(parseFloat(amount))) {
      return 'neutral-amount';
    }
    return parseFloat(amount) < 0 ? 'negative-amount' : 'positive-amount';
  };

  // Determine if save button should be enabled
  const isSaveEnabled = () => {
    // For new records, require at least description or amount
    if (isNew) {
      const hasDescription = Boolean(
        editValues.description?.trim() || 
        (transaction?.description && !editValues.hasOwnProperty('description'))
      );
      const hasAmount = Boolean(
        (editValues.amount !== undefined && editValues.amount !== '') || 
        (transaction?.amount && !editValues.hasOwnProperty('amount'))
      );
      return hasDescription || hasAmount;
    }
    
    // For existing records, enable only if there are actual changes
    return Object.keys(editValues).length > 0;
  };

  const isPending = isUpdating;
  
  // Split flags into active and resolved for display purposes
  const { activeFlags, resolvedFlagsCount } = useMemo(() => {
    if (!transaction || !transaction.flags) {
      return { activeFlags: [], resolvedFlagsCount: localResolvedFlags.length };
    }
    return {
      activeFlags: transaction.flags,
      resolvedFlagsCount: localResolvedFlags.length
    };
  }, [transaction, localResolvedFlags]);
  
  const hasUnresolvedFlags = activeFlags && activeFlags.length > 0;
  const hasOnlyResolvedFlags = !hasUnresolvedFlags && resolvedFlagsCount > 0;

  return (
    <>
      <div className={`transaction-row ${isEditing ? 'editing-row' : ''}`}>
        <div className="transaction-cell date-cell">
          {/* Date Field */}
          <input
            type={isEditing && isFieldEditable('datetime') ? "datetime-local" : "text"}
            value={
              isEditing && isFieldEditable('datetime') 
                ? new Date(editValues.datetime || transaction?.datetime || new Date().toISOString())
                    .toISOString().slice(0, 16)
                : isNew ? '' : formatDate(transaction?.datetime)
            }
            placeholder={isNew ? "Date" : ""}
            onChange={(e) => handleInputChange('datetime', 
              e.target.value ? new Date(e.target.value).toISOString() : ''
            )}
            disabled={!isEditing || !isFieldEditable('datetime') || isPending}
            readOnly={!isEditing || !isFieldEditable('datetime')}
          />
        </div>
        <div className="transaction-cell amount-cell">
          {/* Amount Field */}
          <input
            type="text"
            value={
              isEditing && isFieldEditable('amount') 
                ? editValues.amount !== undefined ? editValues.amount : transaction?.amount || ''
                : isNew ? '' : formatAmount(transaction?.amount)
            }
            placeholder={isNew ? "Amount" : ""}
            onChange={(e) => handleInputChange('amount', e.target.value)}
            disabled={!isEditing || !isFieldEditable('amount') || isPending}
            readOnly={!isEditing || !isFieldEditable('amount')}
            className={getAmountClass(isEditing ? editValues.amount || transaction?.amount : transaction?.amount)}
          />
        </div>
        <div className="transaction-cell description-cell">
          {/* Description Field */}
          <input
            type="text"
            value={
              isEditing && isFieldEditable('description')
                ? editValues.description !== undefined ? editValues.description : transaction?.description || ''
                : isNew ? '' : transaction?.description || ''
            }
            placeholder={isNew ? "Description" : ""}
            onChange={(e) => handleInputChange('description', e.target.value)}
            disabled={!isEditing || !isFieldEditable('description') || isPending}
            readOnly={!isEditing || !isFieldEditable('description')}
          />
        </div>
        <div className="transaction-cell category-cell">
          {/* Category Field */}
          <input
            type="text"
            value={
              isEditing && isFieldEditable('category')
                ? editValues.category !== undefined ? editValues.category : transaction?.category || ''
                : isNew ? '' : transaction?.category || ''
            }
            placeholder={isNew ? "Category" : ""}
            onChange={(e) => handleInputChange('category', e.target.value)}
            disabled={!isEditing || !isFieldEditable('category') || isPending}
            readOnly={!isEditing || !isFieldEditable('category')}
          />
        </div>
        <div className="transaction-cell action-buttons">
          {isEditing ? (
            <>
              <button
                className="icon-button save-button"
                onClick={handleSave}
                disabled={isPending || !isSaveEnabled()}
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
                onClick={handleCancel}
                disabled={isPending}
                title="Cancel"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              {!isNew && transaction && (
                <>
                  <button
                    className="icon-button edit-button"
                    onClick={handleEdit}
                    title="Edit transaction"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    className="icon-button delete-button"
                    onClick={handleDelete}
                    title="Delete transaction"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    className="icon-button info-button"
                    onClick={() => setExpandedDetails(!expandedDetails)}
                    title="Transaction details"
                  >
                    <Info size={18} />
                    {/* Show flag count with appropriate styling */}
                    {hasUnresolvedFlags && (
                      <span className="flag-count">{activeFlags.length}</span>
                    )}
                    {hasOnlyResolvedFlags && (
                      <span className="flag-count resolved-only">{resolvedFlagsCount}</span>
                    )}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Details / Flags Row */}
      {expandedDetails && transaction && (
        <div className={`flag-details-row ${hasUnresolvedFlags ? 'has-unresolved-flags' : ''} ${hasOnlyResolvedFlags ? 'resolved-flags-only' : ''}`}>
          <div className="flag-details">
            <h4>Transaction Details</h4>
            <div className="transaction-metadata">
              <div className="metadata-item">
                <span className="metadata-label">Created:</span> {formatDate(transaction.created_at)}
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Updated:</span> {formatDate(transaction.updated_at)}
              </div>
              <div className="metadata-item">
                <span className="metadata-label">ID:</span> {transaction.id}
              </div>
            </div>
            
            {/* Active/Unresolved Flags */}
            {hasUnresolvedFlags && (
              <div className="flags-section">
                <h5>Unresolved Flags</h5>
                <ul className="flags-list">
                  {activeFlags.map((flag, idx) => (
                    <li key={`active-${idx}`} className="flag-item">
                      <div className="flag-content">
                        {/* Checkbox for resolving flags */}
                        <input 
                          type="checkbox"
                          className="flag-checkbox"
                          onChange={() => flag.id && handleResolveFlag(flag)}
                          disabled={!flag.is_resolvable || (flag.id && resolvingFlags.has(flag.id))}
                          title={flag.is_resolvable ? "Mark as resolved" : "System flags cannot be resolved"}
                          checked={false}
                        />
                        
                        <div className="flag-text">
                          <strong>{flag.flag_type}</strong>: {flag.message}
                          {!flag.is_resolvable && (
                            <span className="system-flag">System</span>
                          )}
                          {flag.duplicates_transaction && (
                            <div className="duplicate-info">
                              Duplicates Transaction ID: {flag.duplicates_transaction}
                            </div>
                          )}
                        </div>
                        
                        {/* Loading indicator while resolving */}
                        {flag.id && resolvingFlags.has(flag.id) && (
                          <Loader2 className="spinner-icon" size={16} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Resolved Flags */}
            {localResolvedFlags.length > 0 && (
              <div className="resolved-flags-section">
                <h5>Resolved Flags</h5>
                <ul className="flags-list">
                  {localResolvedFlags.map((flag, idx) => (
                    <li key={`resolved-${idx}`} className="flag-item resolved">
                      <div className="flag-content">
                        {/* Checkbox for resolved flags (always checked and disabled) */}
                        <input 
                          type="checkbox"
                          className="flag-checkbox"
                          disabled={true}
                          checked={true}
                          title="This flag has been resolved"
                        />
                        
                        <div className="flag-text">
                          <strong>{flag.flag_type}</strong>: {flag.message}
                          {flag.duplicates_transaction && (
                            <div className="duplicate-info">
                              Duplicates Transaction ID: {flag.duplicates_transaction}
                            </div>
                          )}
                          <small>(Resolved)</small>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* No flags message */}
            {!hasUnresolvedFlags && !hasOnlyResolvedFlags && (
              <p className="no-flags-message">This transaction has no flags.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
};
