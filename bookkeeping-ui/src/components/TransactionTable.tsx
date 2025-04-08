import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction, TransactionSort, TransactionSortColumn, TRANSACTION_KEYS, updateTransaction } from '../api/transactions';
import { AlertTriangle, Check, X, Loader2, Edit, Trash2, Info } from 'lucide-react';
import './TransactionTable.css';

interface TransactionTableProps {
  tableProps: {
    transactions: Transaction[];
    currentSort: TransactionSort;
    onChangeSort: (column: TransactionSortColumn) => void;
    onPageForward: () => void;
    onPageBack: () => void;
    currentPage: number;
    hasNextPage: boolean;
    editableFields?: Array<keyof Transaction>;
  }
}

export const TransactionTable: React.FC<TransactionTableProps> = ({ tableProps }) => {
  const {
    transactions,
    currentSort,
    onChangeSort,
    onPageForward,
    onPageBack,
    currentPage,
    hasNextPage,
    editableFields = ['description', 'category', 'amount']
  } = tableProps;

  const queryClient = useQueryClient();
  const [expandedFlags, setExpandedFlags] = useState<Record<number, boolean>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editedValues, setEditedValues] = useState<Partial<Transaction>>({});

  // Update transaction mutation
  const updateMutation = useMutation({
    mutationFn: (updatedTransaction: Partial<Transaction> & { id: number }) => {
      return updateTransaction(updatedTransaction);
    },
    onSuccess: () => {
      // Invalidate and refetch queries related to transactions
      queryClient.invalidateQueries({ queryKey: [TRANSACTION_KEYS.all] });
      setEditingId(null);
      setEditedValues({});
    }
  });

  // Delete transaction mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      // Simulate API call with 1 second delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Deleting transaction:', id);
      return id;
    },
    onSuccess: () => {
      // Invalidate and refetch queries related to transactions
      queryClient.invalidateQueries({ queryKey: [TRANSACTION_KEYS.all] });
    }
  });

  const toggleFlag = (id: number) => {
    setExpandedFlags(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSort = (column: TransactionSortColumn) => {
    onChangeSort(column);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatAmount = (amount: string) => {
    const numAmount = parseFloat(amount);
    return numAmount.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    });
  };

  const renderSortArrow = (column: TransactionSortColumn) => {
    if (currentSort.column !== column) return null;

    return (
      <span className="sort-arrow">
        {currentSort.order === 'asc' ? ' ▲' : ' ▼'}
      </span>
    );
  };

  const handleEdit = (transaction: Transaction) => {
    if (editingId === transaction.id) {
      // Save changes
      updateMutation.mutate({
        ...transaction,
        ...editedValues
      });
    } else {
      // Start editing
      setEditingId(transaction.id);
      setEditedValues({});
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditedValues({});
  };

  const handleInputChange = (field: keyof Transaction, value: string) => {
    setEditedValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const isFieldEditable = (field: keyof Transaction) => {
    return editableFields.includes(field);
  };

  return (
    <div className="transaction-table-container">
      <table className="transaction-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('datetime')}>
              Date {renderSortArrow('datetime')}
            </th>
            <th onClick={() => handleSort('amount')}>
              Amount {renderSortArrow('amount')}
            </th>
            <th onClick={() => handleSort('description')}>
              Description {renderSortArrow('description')}
            </th>
            <th>Category</th>
            <th className="actions-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(transaction => (
            <React.Fragment key={transaction.id}>
              <tr className={editingId === transaction.id ? 'editing-row' : ''}>
                <td>
                  {editingId === transaction.id && isFieldEditable('datetime') ? (
                    <input
                      type="datetime-local"
                      value={editedValues.datetime !== undefined ?
                        new Date(editedValues.datetime).toISOString().slice(0, 16) :
                        new Date(transaction.datetime).toISOString().slice(0, 16)}
                      onChange={(e) => handleInputChange('datetime', new Date(e.target.value).toISOString())}
                      disabled={updateMutation.isPending}
                    />
                  ) : (
                    formatDate(transaction.datetime)
                  )}
                </td>
                <td className={parseFloat(transaction.amount) < 0 ? 'negative-amount' : 'positive-amount'}>
                  {editingId === transaction.id && isFieldEditable('amount') ? (
                    <input
                      type="text"
                      value={editedValues.amount !== undefined ? editedValues.amount : transaction.amount}
                      onChange={(e) => handleInputChange('amount', e.target.value)}
                      className={parseFloat(editedValues.amount || transaction.amount) < 0 ? 'negative-amount' : 'positive-amount'}
                      disabled={updateMutation.isPending}
                    />
                  ) : (
                    formatAmount(transaction.amount)
                  )}
                </td>
                <td>
                  {editingId === transaction.id && isFieldEditable('description') ? (
                    <input
                      type="text"
                      value={editedValues.description !== undefined ? editedValues.description : transaction.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      disabled={updateMutation.isPending}
                    />
                  ) : (
                    transaction.description
                  )}
                </td>
                <td>
                  {editingId === transaction.id && isFieldEditable('category') ? (
                    <input
                      type="text"
                      value={editedValues.category !== undefined ? editedValues.category : transaction.category}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                      disabled={updateMutation.isPending}
                    />
                  ) : (
                    transaction.category
                  )}
                </td>
                <td className="action-buttons">
                  {editingId === transaction.id ? (
                    <>
                      <button
                        className="icon-button save-button"
                        onClick={() => handleEdit(transaction)}
                        disabled={updateMutation.isPending}
                        title="Save changes"
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="spinner-icon" size={18} />
                        ) : (
                          <Check size={18} />
                        )}
                      </button>
                      <button
                        className="icon-button cancel-button"
                        onClick={handleCancelEdit}
                        disabled={updateMutation.isPending}
                        title="Cancel"
                      >
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-button edit-button"
                        onClick={() => handleEdit(transaction)}
                        title="Edit transaction"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="icon-button delete-button"
                        onClick={() => handleDelete(transaction.id)}
                        disabled={deleteMutation.isPending && deleteMutation.variables === transaction.id}
                        title="Delete transaction"
                      >
                        {deleteMutation.isPending && deleteMutation.variables === transaction.id ? (
                          <Loader2 className="spinner-icon" size={18} />
                        ) : (
                          <Trash2 size={18} />
                        )}
                      </button>
                      <button
                        className="icon-button info-button"
                        onClick={() => toggleFlag(transaction.id)}
                        title="Transaction details"
                      >
                        <Info size={18} />
                        {transaction.flags.length > 0 && (
                          <span className="flag-count">{transaction.flags.length}</span>
                        )}
                      </button>
                    </>
                  )}
                </td>
              </tr>
              {expandedFlags[transaction.id] && (
                <tr className="flag-details-row">
                  <td colSpan={5}>
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
                      
                      {transaction.flags.length > 0 && (
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
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        <button
          onClick={onPageBack}
          disabled={currentPage <= 1}
          className="page-button"
        >
          &laquo; Previous
        </button>
        <span className="page-info">Page {currentPage}</span>
        <button
          onClick={onPageForward}
          disabled={!hasNextPage}
          className="page-button"
        >
          Next &raquo;
        </button>
      </div>
    </div>
  );
};
