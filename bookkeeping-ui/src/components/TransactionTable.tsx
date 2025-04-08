import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction, TransactionSort, TransactionSortColumn, TRANSACTION_KEYS } from '../api/transactions';
import { Plus } from 'lucide-react';
import { TransactionRow } from './TransactionRow';
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
    onCreateTransaction?: (transaction: Partial<Transaction>) => Promise<any>;
    onDeleteTransaction?: (id: number) => Promise<any>;
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
    onCreateTransaction,
    onDeleteTransaction,
    editableFields = ['description', 'category', 'amount', 'datetime']
  } = tableProps;

  const queryClient = useQueryClient();
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showNewTransactionRow, setShowNewTransactionRow] = useState<boolean>(false);

  // Delete transaction mutation - simplified
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (onDeleteTransaction) {
        return onDeleteTransaction(id);
      }
      // Use the API function if no custom handler is provided
      const { deleteTransaction } = await import('../api/transactions');
      return deleteTransaction(id);
    },
    onSuccess: () => {
      showNotification('success', 'Transaction deleted successfully');
      // Invalidate all transaction queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error) => {
      showNotification('error', error instanceof Error ? error.message : 'Failed to delete transaction');
    }
  });

  // Create transaction mutation - simplified
  const createMutation = useMutation({
    mutationFn: async (newTransaction: Partial<Transaction>) => {
      if (onCreateTransaction) {
        return onCreateTransaction(newTransaction);
      }
      // Use the API function if no custom handler is provided
      const { createTransaction } = await import('../api/transactions');
      return createTransaction(newTransaction);
    },
    onSuccess: () => {
      showNotification('success', 'Transaction created successfully');
      setShowNewTransactionRow(false);
      // Invalidate all transaction queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error) => {
      showNotification('error', error instanceof Error ? error.message : 'Failed to create transaction');
    }
  });

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    
    // Clear notification after 3 seconds
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  const handleDeleteTransaction = (id: number) => {
    deleteMutation.mutate(id);
  };

  const handleCreateTransaction = (transaction: Partial<Transaction>) => {
    createMutation.mutate(transaction);
  };

  const renderSortArrow = (column: TransactionSortColumn) => {
    if (currentSort.column !== column) return null;

    return (
      <span className="sort-arrow">
        {currentSort.order === 'asc' ? ' ▲' : ' ▼'}
      </span>
    );
  };

  return (
    <div className="transaction-table-container">
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      
      <div className="table-header">
        <h2>Transactions</h2>
        <div className="table-actions">
          <button 
            className="add-button"
            onClick={() => setShowNewTransactionRow(!showNewTransactionRow)}
            title={showNewTransactionRow ? "Cancel" : "Add new transaction"}
          >
            <Plus size={18} />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      <table className="transaction-table">
        <thead>
          <tr>
            <th onClick={() => onChangeSort('datetime')}>
              Date {renderSortArrow('datetime')}
            </th>
            <th onClick={() => onChangeSort('amount')}>
              Amount {renderSortArrow('amount')}
            </th>
            <th onClick={() => onChangeSort('description')}>
              Description {renderSortArrow('description')}
            </th>
            <th>Category</th>
            <th className="actions-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          {/* New Transaction Row */}
          {showNewTransactionRow && (
            <TransactionRow
              transaction={null}
              isNew={true}
              onSaveNew={handleCreateTransaction}
              onCancel={() => setShowNewTransactionRow(false)}
              editableFields={editableFields}
              showNotification={showNotification}
            />
          )}
          
          {/* Existing Transactions */}
          {transactions.map(transaction => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onDelete={handleDeleteTransaction}
              editableFields={editableFields}
              showNotification={showNotification}
            />
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
