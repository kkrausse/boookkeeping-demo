import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Transaction, TransactionSort, TRANSACTION_KEYS } from '../api/transactions';
import { Check, X, Edit, Trash2, Info, Loader2 } from 'lucide-react';

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
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState<boolean>(isNew);
  const [expandedDetails, setExpandedDetails] = useState<boolean>(false);
  // We'll use a single state for the displayed transaction data
  // This provides a simpler optimistic update approach
  const [displayedTransaction, setDisplayedTransaction] = useState<Partial<Transaction>>({
    description: transaction?.description || '',
    category: transaction?.category || '',
    amount: transaction?.amount || '',
    datetime: transaction?.datetime || new Date().toISOString(),
  });
  
  // Initialize with empty transaction or the provided transaction when entering edit mode
  useEffect(() => {
    if (isNew || isEditing) {
      setDisplayedTransaction({
        description: transaction?.description || '',
        category: transaction?.category || '',
        amount: transaction?.amount || '',
        datetime: transaction?.datetime || new Date().toISOString(),
      });
    }
  }, [isNew, isEditing, transaction]);

  // Track loading state for update operations
  const [isUpdating, setIsUpdating] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (isNew && onSaveNew) {
      onSaveNew(displayedTransaction);
      return;
    }
    
    if (transaction && onUpdateTransaction) {
      setIsUpdating(true);
      try {
        // Use the centralized update function from props
        await onUpdateTransaction({
          id: transaction.id,
          ...displayedTransaction,
        });
        
        // On success
        showNotification('success', 'Transaction updated successfully');
        setIsEditing(false);
      } catch (error) {
        // On error
        showNotification('error', error instanceof Error ? error.message : 'Failed to update transaction');
        
        // Reset to original transaction data
        if (transaction) {
          setDisplayedTransaction({
            description: transaction.description || '',
            category: transaction.category || '',
            amount: transaction.amount || '',
            datetime: transaction.datetime || new Date().toISOString(),
          });
        }
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleCancel = () => {
    if (isNew && onCancel) {
      onCancel();
      return;
    }
    
    // Reset to original transaction data
    if (transaction) {
      setDisplayedTransaction({
        description: transaction.description || '',
        category: transaction.category || '',
        amount: transaction.amount || '',
        datetime: transaction.datetime || new Date().toISOString(),
      });
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (!transaction) return;
    
    if (onDelete && confirm('Are you sure you want to delete this transaction?')) {
      onDelete(transaction.id);
    }
  };

  const handleInputChange = (field: keyof Transaction, value: string) => {
    setDisplayedTransaction(prev => ({
      ...prev,
      [field]: value
    }));
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

  // Determine if a new record has required fields filled out
  const isSaveEnabled = () => {
    // For new records, require at least description or amount
    if (isNew) {
      return Boolean(displayedTransaction.description?.trim() || 
        (displayedTransaction.amount !== undefined && displayedTransaction.amount !== ''));
    }
    // For existing records, always enable save
    return true;
  };

  const isPending = isUpdating;

  return (
    <>
      <div className={`transaction-row ${isEditing ? 'editing-row' : ''}`}>
        <div className="transaction-cell date-cell">
          {/* Date Field */}
          <input
            type={isEditing && isFieldEditable('datetime') ? "datetime-local" : "text"}
            value={
              isEditing && isFieldEditable('datetime') 
                ? new Date(displayedTransaction.datetime || new Date().toISOString())
                    .toISOString().slice(0, 16)
                : isNew ? '' : formatDate(displayedTransaction.datetime)
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
                ? displayedTransaction.amount || ''
                : isNew ? '' : formatAmount(displayedTransaction.amount)
            }
            placeholder={isNew ? "Amount" : ""}
            onChange={(e) => handleInputChange('amount', e.target.value)}
            disabled={!isEditing || !isFieldEditable('amount') || isPending}
            readOnly={!isEditing || !isFieldEditable('amount')}
            className={getAmountClass(displayedTransaction.amount)}
          />
        </div>
        <div className="transaction-cell description-cell">
          {/* Description Field */}
          <input
            type="text"
            value={displayedTransaction.description || ''}
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
            value={displayedTransaction.category || ''}
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
                    {transaction.flags && transaction.flags.length > 0 && (
                      <span className="flag-count">{transaction.flags.length}</span>
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
        <div className={`flag-details-row ${transaction.flags && transaction.flags.length > 0 ? 'has-flags' : ''}`}>
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
            
            {transaction.flags && transaction.flags.length > 0 && (
              <>
                <h5>Flags</h5>
                <ul className="flags-list">
                  {transaction.flags.map((flag, idx) => (
                    <li key={idx} className="flag-item">
                      <strong>{flag.flag_type}</strong>: {flag.message}
                      {flag.duplicates_transaction && (
                        <div className="duplicate-info">
                          Duplicates Transaction ID: {flag.duplicates_transaction}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
