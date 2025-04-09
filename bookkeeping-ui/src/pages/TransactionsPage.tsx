import { useState } from 'react'
import {
  QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import './TransactionsPage.css'
import { 
  Transaction, 
  fetchTransactions, 
  deleteTransaction, 
  createTransaction,
  updateTransaction,
  uploadCSV, 
  TRANSACTION_KEYS,
  TransactionSort,
  TransactionSortColumn,
  PaginatedResponse,
  FetchTransactionsParams,
  FilterParams,
  UploadCSVResponse
} from '../api/transactions';
import { TransactionTable } from '../components/TransactionTable';

interface CsvUploadProps {
  className?: string;
  buttonOnly?: boolean;
  showNotification?: (type: 'success' | 'error', message: string) => void;
}

function CsvUpload({ className, buttonOnly, showNotification }: CsvUploadProps) {
  const queryClient = useQueryClient();
  const [uploadResult, setUploadResult] = useState<UploadCSVResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const { mutate: fileMutate } = useMutation<UploadCSVResponse, Error, File>({
    mutationFn: uploadCSV,
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: ['transactions']});
      setUploadResult(data);
      setIsUploading(false);
      setShowResults(true);
      
      // If we have showNotification, use it for feedback
      if (showNotification) {
        if (data.created_count > 0) {
          showNotification('success', `Successfully imported ${data.created_count} transactions`);
        } else if (data.errors && data.errors.length > 0) {
          showNotification('error', 'Error uploading file. See details in results panel.');
        }
      }
    },
    onError: (err) => {
      console.error('Upload failed:', err);
      setIsUploading(false);
      setUploadResult({
        created: [],
        created_count: 0,
        errors: [`Upload failed: ${err.message}`]
      });
      setShowResults(true);
      
      if (showNotification) {
        showNotification('error', `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setIsUploading(true);
      setUploadResult(null);
      setShowResults(false);
      fileMutate(event.target.files[0]);
    }
  };

  const clearResults = () => {
    setUploadResult(null);
    setShowResults(false);
  };

  // Just the button for use in the table header
  if (buttonOnly) {
    return (
      <label className="csv-upload-button">
        {isUploading ? (
          <>
            <Loader2 className="spinner-icon" size={16} />
            <span>Uploading...</span>
          </>
        ) : (
          <>
            <span>Import CSV</span>
          </>
        )}
        <input 
          type="file" 
          accept=".csv" 
          onChange={handleFileChange} 
          disabled={isUploading} 
          style={{ display: 'none' }}
        />
      </label>
    );
  }

  // Full component with results panel
  return (
    <div className={`csv-upload-container ${className || ''}`}>
      <div className="csv-upload-header">
        <h3>Import Transactions</h3>
        <label className="csv-upload-button">
          {isUploading ? 'Uploading...' : 'Choose CSV file'}
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange} 
            disabled={isUploading} 
            style={{ display: 'none' }}
          />
        </label>
      </div>
      
      {showResults && uploadResult && (
        <div className="upload-results">
          <div className="upload-results-header">
            <h4>Upload Results</h4>
            <button onClick={clearResults} className="close-button">×</button>
          </div>
          
          {uploadResult.created_count > 0 && (
            <div className="upload-success">
              Successfully imported {uploadResult.created_count} transactions
            </div>
          )}
          
          {uploadResult.error && (
            <div className="upload-error-message">
              {uploadResult.error}
            </div>
          )}
          
          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <div className="upload-errors">
              <h5>Errors ({uploadResult.errors.length})</h5>
              <ul className="error-list">
                {uploadResult.errors.map((error, index) => (
                  <li key={`error-${index}`} className="error-item">{error}</li>
                ))}
              </ul>
            </div>
          )}
          
          {uploadResult.warnings && uploadResult.warnings.length > 0 && (
            <div className="upload-warnings">
              <h5>Warnings ({uploadResult.warnings.length})</h5>
              <ul className="warning-list">
                {uploadResult.warnings.map((warning, index) => (
                  <li key={`warning-${index}`} className="warning-item">{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [currentSort, setCurrentSort] = useState<TransactionSort>({ column: 'datetime', order: 'desc' });
  const [filters, setFilters] = useState<FilterParams>({
    description: '',
    amountValue: '',
    amountComparison: ''
  });
  const pageSize = 10; // Match the default in the backend

  // Create query parameters object
  const queryParams: FetchTransactionsParams = {
    page: currentPage,
    pageSize: pageSize,
    sort: currentSort,
    filters: filters.description || (filters.amountValue && filters.amountComparison) 
      ? filters 
      : undefined
  };

  // Fetch transactions with pagination
  const { data, isLoading, error } = useQuery<PaginatedResponse<Transaction>, Error>({
    queryKey: TRANSACTION_KEYS.paginated(queryParams),
    queryFn: () => fetchTransactions(queryParams).then(r => r.data),
    placeholderData: keepPreviousData
  });
  
  // Create a new transaction
  const handleCreateTransaction = async (newTransaction: Partial<Transaction>) => {
    return createTransaction(newTransaction);
  };
  
  // Delete a transaction
  const handleDeleteTransaction = async (id: number) => {
    await deleteTransaction(id);
    return id;
  };
  
  // Update a transaction with optimistic updates
  const handleUpdateTransaction = async (transaction: Partial<Transaction> & { id: number }) => {
    // Get current data for rollback if needed
    const currentData = queryClient.getQueryData<PaginatedResponse<Transaction>>(
      TRANSACTION_KEYS.paginated(queryParams)
    );

    // Optimistically update the cache
    if (currentData) {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.paginated(queryParams) });
      queryClient.setQueryData<PaginatedResponse<Transaction>>(
        TRANSACTION_KEYS.paginated(queryParams),
        oldData => {

          if (!oldData) return oldData;

          console.log('new results', oldData.results.map(tx =>
              tx.id === transaction.id ? { ...tx, ...transaction } : tx
            ))

          return {
            ...oldData,
            results: oldData.results.map(tx => 
              tx.id === transaction.id ? { ...tx, ...transaction } : tx
            )
          };
        }
      );
    }
    
    try {
      // Make the API call
      const result = await updateTransaction(transaction);
      
      // On success
      showNotification('success', 'Transaction updated successfully');
      
      // Invalidate query to ensure data consistency
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.paginated(queryParams) });
      
      return result;
    } catch (error) {
      // On error, rollback the optimistic update
      if (currentData) {
        queryClient.setQueryData(
          TRANSACTION_KEYS.paginated(queryParams), 
          currentData
        );
      }
      
      // Show error notification
      showNotification('error', error instanceof Error ? error.message : 'Failed to update transaction');
      
      throw error;
    }
  };

  // Handle pagination
  const handlePageForward = () => {
    if (data?.next) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePageBack = () => {
    if (data?.previous && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  // Handle sorting
  const handleSortChange = (column: TransactionSortColumn) => {
    setCurrentSort(prev => {
      if (prev.column === column) {
        // Toggle order if same column
        return {
          column,
          order: prev.order === 'asc' ? 'desc' : 'asc'
        };
      } else {
        // Default to descending order for new column
        return {
          column,
          order: 'desc'
        };
      }
    });
    // Reset to first page when sorting changes
    setCurrentPage(1);
  };
  
  // Handle filter changes
  const handleFilterChange = (newFilters: FilterParams) => {
    setFilters(newFilters);
    // Reset to first page when filters change
    setCurrentPage(1);
  };

  if (error) return <div className="error-message">Error: {error.message}</div>;

  const transactions: Transaction[] = data?.results || [];
  const totalCount = data?.count || 0;
  const hasNextPage = !!data?.next;

  // State for notifications
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  
  // Create a notification function for CSV upload and other actions
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    
    // Clear notification after 3 seconds
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  // Results panel for CSV upload
  const [showCsvResults, setShowCsvResults] = useState(false);
  const [csvUploadResult, setCsvUploadResult] = useState<UploadCSVResponse | null>(null);
  
  const handleCsvResult = (result: UploadCSVResponse | null) => {
    setCsvUploadResult(result);
    if (result) {
      setShowCsvResults(true);
      
      // Show a notification based on result
      if (result.created_count > 0) {
        showNotification('success', `Successfully imported ${result.created_count} transactions`);
      } else if (result.errors && result.errors.length > 0) {
        showNotification('error', 'Error uploading CSV. Check the results panel for details.');
      }
    }
  };

  return (
    <div className="page-container">
      <h1>Transactions</h1>
      
      {/* Notification tooltip */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      
      {/* Show CSV results panel if needed */}
      {showCsvResults && csvUploadResult && (
        <div className="csv-results-panel page-section">
          <div className="upload-results">
            <div className="upload-results-header">
              <h4>Upload Results</h4>
              <button onClick={() => setShowCsvResults(false)} className="close-button">×</button>
            </div>
            
            {csvUploadResult.created_count > 0 && (
              <div className="upload-success">
                Successfully imported {csvUploadResult.created_count} transactions
              </div>
            )}
            
            {csvUploadResult.error && (
              <div className="upload-error-message">
                {csvUploadResult.error}
              </div>
            )}
            
            {csvUploadResult.errors && csvUploadResult.errors.length > 0 && (
              <div className="upload-errors">
                <h5>Errors ({csvUploadResult.errors.length})</h5>
                <ul className="error-list">
                  {csvUploadResult.errors.map((error, index) => (
                    <li key={`error-${index}`} className="error-item">{error}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {csvUploadResult.warnings && csvUploadResult.warnings.length > 0 && (
              <div className="upload-warnings">
                <h5>Warnings ({csvUploadResult.warnings.length})</h5>
                <ul className="warning-list">
                  {csvUploadResult.warnings.map((warning, index) => (
                    <li key={`warning-${index}`} className="warning-item">{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="transactions-info">Total: {totalCount}</div>
      <TransactionTable tableProps={({
        transactions: transactions,
        currentSort: currentSort,
        onChangeSort: handleSortChange,
        onPageForward: handlePageForward,
        onPageBack: handlePageBack,
        currentPage: currentPage,
        hasNextPage: hasNextPage,
        isLoading: isLoading,
        onCreateTransaction: handleCreateTransaction,
        onDeleteTransaction: handleDeleteTransaction,
        onUpdateTransaction: handleUpdateTransaction,
        filters: filters,
        onFilterChange: handleFilterChange,
        csvUploadButton: <CsvUpload buttonOnly showNotification={showNotification} />
      })}/>
    </div>
  );
}
