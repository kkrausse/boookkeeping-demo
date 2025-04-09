import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Transaction, 
  TransactionSort, 
  TransactionSortColumn, 
  TRANSACTION_KEYS, 
  FilterParams
} from '../api/transactions';
import { Plus, Filter, Loader2, Tag, Flag, Minus, Check } from 'lucide-react';
import { TransactionRow } from './TransactionRow';
import { FilterPanel } from './FilterPanel';
import { ActionMenu } from './ActionMenu';
import { ActionData } from './ActionInputs';
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
    onUpdateTransaction?: (transaction: Partial<Transaction> & { id: number }) => Promise<any>;
    editableFields?: Array<keyof Transaction>;
    filters: FilterParams;
    onFilterChange: (filters: FilterParams) => void;
    csvUploadButton?: React.ReactNode; // Additional prop for CSV upload button
    onRefresh?: () => void; // Function to force refresh data
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
    onUpdateTransaction,
    editableFields = ['description', 'category', 'amount', 'datetime'],
    filters,
    onFilterChange,
    csvUploadButton,
    onRefresh
  } = tableProps;

  const queryClient = useQueryClient();
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showNewTransactionRow, setShowNewTransactionRow] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  
  // Selection state
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set());
  const [bulkActionData, setBulkActionData] = useState<ActionData>({});
  
  const isFiltersActive = () => {
    return filters.description !== '' || 
           (filters.amountValue !== '' && filters.amountComparison !== '');
  };
  
  const clearFilters = () => {
    const emptyFilters = {
      description: '',
      amountValue: '',
      amountComparison: ''
    };
    onFilterChange(emptyFilters);
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
  
  // State for batch operations loading
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  
  // Apply actions to multiple transactions using the centralized update function
  const handleBatchUpdate = async (actionData: ActionData) => {
    if (!onUpdateTransaction) return;
    
    const transactionIds = Array.from(selectedTransactions);
    setIsBatchUpdating(true);
    
    try {
      // Process each transaction sequentially
      const results = [];
      for (const id of transactionIds) {
        const transaction = transactions.find(t => t.id === id);
        if (!transaction) continue;
        
        // Prepare the update
        const update: any = { id };
        
        // Add category if provided
        if (actionData.category) {
          update.category = actionData.category;
        }
        
        // For flags, we would need additional backend support
        // This is a placeholder for now
        if (actionData.flagMessage) {
          console.log(`Adding flag "${actionData.flagMessage}" to transaction ${id}`);
        }
        
        // Apply the update if we have a category change
        if (actionData.category) {
          const result = await onUpdateTransaction({ ...transaction, ...update });
          results.push(result);
        }
      }
      
      // Clear selection after successful update
      setSelectedTransactions(new Set());
      setBulkActionData({});
      showNotification('success', 'Selected transactions updated successfully');
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to update transactions');
    } finally {
      setIsBatchUpdating(false);
    }
  };
  
  // Selection handlers
  const handleSelectAll = () => {
    if (selectedTransactions.size > 0) {
      // If any are selected, deselect all
      setSelectedTransactions(new Set());
    } else {
      // Select all visible transactions
      const newSelection = new Set<number>();
      transactions.forEach(transaction => {
        if (transaction.id) {
          newSelection.add(transaction.id);
        }
      });
      setSelectedTransactions(newSelection);
    }
  };
  
  const handleSelectTransaction = (id: number, selected: boolean) => {
    const newSelection = new Set(selectedTransactions);
    if (selected) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    setSelectedTransactions(newSelection);
  };
  
  // Action handlers for bulk operations
  const handleActionChange = (actionData: ActionData) => {
    setBulkActionData(actionData);
  };
  
  const handleApplyActions = () => {
    if (selectedTransactions.size === 0 || (!bulkActionData.category && !bulkActionData.flagMessage)) {
      return;
    }
    
    // Apply the actions to selected transactions using our centralized approach
    handleBatchUpdate(bulkActionData);
  };
  
  // Handle bulk deletion of selected transactions
  const handleBatchDelete = async () => {
    if (selectedTransactions.size === 0 || !onDeleteTransaction) {
      return;
    }
    
    setIsBatchDeleting(true);
    
    try {
      // Process each transaction deletion sequentially
      const transactionIds = Array.from(selectedTransactions);
      for (const id of transactionIds) {
        await onDeleteTransaction(id);
      }
      
      // Clear selection after successful deletions
      setSelectedTransactions(new Set());
      showNotification('success', `${transactionIds.length} transactions deleted successfully`);
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to delete transactions');
    } finally {
      setIsBatchDeleting(false);
    }
  };
  
  // Determine checkbox state for header (all, none, or some selected)
  const getSelectAllState = () => {
    if (selectedTransactions.size === 0) return 'none';
    if (selectedTransactions.size === transactions.length) return 'all';
    return 'some';
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
          {csvUploadButton}
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
        <FilterPanel 
          filters={filters}
          onFilterChange={onFilterChange}
          isFiltersActive={isFiltersActive()}
          clearFilters={clearFilters}
          showNotification={showNotification}
        />
      )}

      {/* Action Menu for selected transactions */}
      <div className="action-menu-container">
        {selectedTransactions.size > 0 && (
          <ActionMenu 
            visible={true}
            selectedCount={selectedTransactions.size}
            onActionChange={handleActionChange}
            onApply={handleApplyActions}
            onCancel={() => setSelectedTransactions(new Set())}
            onDelete={handleBatchDelete}
            disabled={isBatchUpdating || isBatchDeleting}
          />
        )}
      </div>
      

      <table className="transaction-table">
        <thead>
          <tr>
            <th className="checkbox-column">
              <div className="checkbox-container">
                <input 
                  type="checkbox" 
                  checked={selectedTransactions.size === transactions.length && transactions.length > 0}
                  ref={checkbox => {
                    if (checkbox) {
                      if (getSelectAllState() === 'some') {
                        checkbox.indeterminate = true;
                      } else {
                        checkbox.indeterminate = false;
                      }
                    }
                  }}
                  onChange={handleSelectAll}
                  className="table-checkbox"
                />
                {selectedTransactions.size > 0 && (
                  <div className="checkbox-indicator">
                    {getSelectAllState() === 'some' ? <Minus size={12} /> : <Check size={12} />}
                  </div>
                )}
              </div>
            </th>
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
            <tr>
              <td></td> {/* Empty checkbox cell for new row */}
              <td colSpan={5}>
                <TransactionRow
                  transaction={null}
                  isNew={true}
                  onSaveNew={handleCreateTransaction}
                  onCancel={() => setShowNewTransactionRow(false)}
                  editableFields={editableFields}
                  showNotification={showNotification}
                />
              </td>
            </tr>
          )}
          
          {/* Loading State */}
          {isLoading ? (
            <tr className="loading-row">
              <td colSpan={6}>
                <div className="loading-message">
                  <Loader2 className="spinner-icon" size={24} />
                  <span>Loading transactions...</span>
                </div>
              </td>
            </tr>
          ) : transactions.length > 0 ? (
            /* Existing Transactions */
            transactions.map(transaction => (
              <tr key={transaction.id}>
                <td className="checkbox-column">
                  <input 
                    type="checkbox" 
                    checked={transaction.id ? selectedTransactions.has(transaction.id) : false}
                    onChange={(e) => transaction.id && handleSelectTransaction(transaction.id, e.target.checked)}
                    className="table-checkbox"
                  />
                </td>
                <td colSpan={5}>
                  <TransactionRow
                    transaction={transaction}
                    onDelete={handleDeleteTransaction}
                    onUpdateTransaction={onUpdateTransaction}
                    editableFields={editableFields}
                    showNotification={showNotification}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr className="no-results-row">
              <td colSpan={6}>
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
