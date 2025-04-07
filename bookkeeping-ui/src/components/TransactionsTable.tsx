import React, { useState } from 'react';
import { Transaction, fetchTransactions, deleteTransaction, TRANSACTION_KEYS } from '../api/transactions';
import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import './TransactionsTable.css';


export interface Transaction {
  id: number;
  description: string;
  category: string;
  amount: string; // Django DecimalField returns string in JSON
  datetime: string;
  created_at: string;
  updated_at: string;
  flags: TransactionFlag[];
}

export interface TransactionFlag {
  flag_type: string;
  message: string;
  duplicates_transaction: number | null;
}

export type TransactionSortColumn = 'description' | 'amount' | 'datetime' | 'created_at' | 'updated_at';

export interface TransactionSort {
  column: SortColumn
  order: 'asc' | 'desc'
}

export interface TransactionTableProps {
  tableProps: {
    transactions: Transaction[];
    currentSort: TransactionSort;
    onChangeSort: (column: TransactionSortColumn) => void;
    onPageForward: () => void;
    onPageBack: () => void;
    currentPage: number;
    hasNextPage: boolean;
  }
}

export const TransactionTable: React.FC<{ tableProps: TransactionTableProps }> = (props) => {
  const {
    transactions,
    currentPage,
    sortColumn,
    sortDirection,
    onPageChange,
    onSort,
    onEdit,
    onDelete,
    hasNextPage,
  } = props.tableProps;

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editedTransaction, setEditedTransaction] = useState<Transaction | null>(null);

  // Format dates to a human-readable string
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? '' : date.toLocaleString();
  };

  // Convert UTC timestamp to local datetime for input
  const getLocalDateTime = (utcString: string) => {
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleEditClick = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setEditedTransaction({ ...transaction });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditedTransaction(null);
  };

  const handleSave = () => {
    if (editedTransaction) {
      onEdit(editedTransaction);
      setEditingId(null);
      setEditedTransaction(null);
    }
  };

  const handleInputChange = (field: keyof Transaction, value: string) => {
    if (editedTransaction) {
      setEditedTransaction({ ...editedTransaction, [field]: value });
    }
  };

  return (
    <div className="transaction-table-container">
      <table className="transaction-table">
        <thead>
          <tr>
            <th onClick={() => onSort('description')}>
              Description{' '}
              {sortColumn === 'description' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => onSort('category')}>
              Category{' '}
              {sortColumn === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => onSort('amount')}>
              Amount {sortColumn === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => onSort('datetime')}>
              Datetime{' '}
              {sortColumn === 'datetime' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => onSort('created_at')}>
              Created At{' '}
              {sortColumn === 'created_at' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => onSort('updated_at')}>
              Updated At{' '}
              {sortColumn === 'updated_at' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            <th>Flags</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              {editingId === transaction.id ? (
                <>
                  <td>
                    <input
                      type="text"
                      value={editedTransaction?.description || ''}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={editedTransaction?.category || ''}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={editedTransaction?.amount || ''}
                      onChange={(e) => handleInputChange('amount', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="datetime-local"
                      value={editedTransaction ? getLocalDateTime(editedTransaction.datetime) : ''}
                      onChange={(e) => {
                        const localDateTime = e.target.value;
                        if (localDateTime) {
                          const date = new Date(localDateTime);
                          const utcString = date.toISOString();
                          handleInputChange('datetime', utcString);
                        } else {
                          handleInputChange('datetime', transaction.datetime); // Revert to original if cleared
                        }
                      }}
                    />
                  </td>
                  <td>{formatDate(transaction.created_at)}</td>
                  <td>{formatDate(transaction.updated_at)}</td>
                  <td>
                    {transaction.flags.length > 0 && (
                      <span
                        className="flag-icon"
                        title={transaction.flags.map((f) => f.message).join('\n')}
                      >
                        ⚠️
                      </span>
                    )}
                  </td>
                  <td>
                    <button onClick={handleSave}>Save</button>
                    <button onClick={handleCancel}>Cancel</button>
                    <button onClick={() => onDelete(transaction.id)}>Delete</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{transaction.description}</td>
                  <td>{transaction.category}</td>
                  <td>{transaction.amount}</td>
                  <td>{formatDate(transaction.datetime)}</td>
                  <td>{formatDate(transaction.created_at)}</td>
                  <td>{formatDate(transaction.updated_at)}</td>
                  <td>
                    {transaction.flags.length > 0 && (
                      <span
                        className="flag-icon"
                        title={transaction.flags.map((f) => f.message).join('\n')}
                      >
                        ⚠️
                      </span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => handleEditClick(transaction)}>Edit</button>
                    <button onClick={() => onDelete(transaction.id)}>Delete</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          Previous
        </button>
        <span>Page {currentPage}</span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNextPage}
        >
          Next
        </button>
      </div>
    </div>
  );
};
