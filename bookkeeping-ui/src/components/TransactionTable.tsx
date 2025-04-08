import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Transaction, 
  TransactionSort, 
  TransactionSortColumn, 
  TRANSACTION_KEYS, 
  FilterParams 
} from '../api/transactions';
import { Plus, Filter, X, Loader2 } from 'lucide-react';
import { TransactionRow } from './TransactionRow';
import './TransactionTable.css';

type AmountComparisonType = 'above' | 'below' | 'equal' | '';

interface TransactionTableProps {
  tableProps: {
    transactions: Transaction[];
    currentSort: TransactionSort;
    onChangeSort: (column: TransactionSortColumn) => void;
    onPageForward: () => void;
    onPageBack: () => void;
    currentPage: number;
    hasNextPage: boolean;
    isLoading: boolean;
    onCreateTransaction?: (transaction: Partial<Transaction>) => Promise<any>;
    onDeleteTransaction?: (id: number) => Promise<any>;
    editableFields?: Array<keyof Transaction>;
    filters: FilterParams;
    onFilterChange: (filters: FilterParams) => void;
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
    isLoading,
    onCreateTransaction,
    onDeleteTransaction,
    editableFields = ['description', 'category', 'amount', 'datetime'],
    filters,
    onFilterChange
  } = tableProps;

  const queryClient = useQueryClient();
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showNewTransactionRow, setShowNewTransactionRow] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [localFilters, setLocalFilters] = useState<FilterParams>({
    description: filters.description || '',
    amountValue: filters.amountValue || '',
    amountComparison: filters.amountComparison || ''
  });
  
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
  
  // Apply filters when user stops typing or submits
  const applyFilters = () => {
    onFilterChange(localFilters);
  };
  
  // Apply filters with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only apply if different from current filters
      if (
        localFilters.description !== filters.description || 
        localFilters.amountValue !== filters.amountValue ||
        localFilters.amountComparison !== filters.amountComparison
      ) {
        applyFilters();
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [localFilters]);
  
  const clearFilters = () => {
    const emptyFilters = {
      description: '',
      amountValue: '',
      amountComparison: ''
    };
    setLocalFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };
  
  const isFiltersActive = () => {
    return filters.description !== '' || 
           (filters.amountValue !== '' && filters.amountComparison !== '');
  };

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
            className={`filter-button ${isFiltersActive() ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Filter transactions"
          >
            <Filter size={18} />
            <span>Filter</span>
            {isFiltersActive() && <span className="filter-badge" />}
          </button>
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
      
      {/* Filter Panel */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-header">
            <h3>Filter Transactions</h3>
            <button 
              className="clear-filters-button"
              onClick={clearFilters}
              disabled={!isFiltersActive()}
            >
              Clear All
            </button>
          </div>
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
        </div>
      )}

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
          
          {/* Loading State */}
          {isLoading ? (
            <tr className="loading-row">
              <td colSpan={5}>
                <div className="loading-message">
                  <Loader2 className="spinner-icon" size={24} />
                  <span>Loading transactions...</span>
                </div>
              </td>
            </tr>
          ) : transactions.length > 0 ? (
            /* Existing Transactions */
            transactions.map(transaction => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onDelete={handleDeleteTransaction}
                editableFields={editableFields}
                showNotification={showNotification}
              />
            ))
          ) : (
            <tr className="no-results-row">
              <td colSpan={5}>
                <div className="no-results-message">
                  {isFiltersActive() 
                    ? "No transactions match the current filters" 
                    : "No transactions found"}
                  {isFiltersActive() && (
                    <button 
                      className="clear-filters-button"
                      onClick={clearFilters}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}
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
