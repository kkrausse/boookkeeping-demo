import { useState } from 'react'
import {
  QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { 
  Transaction, 
  fetchTransactions, 
  deleteTransaction, 
  createTransaction,
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
}

function CsvUpload({ className }: CsvUploadProps) {
  const queryClient = useQueryClient();
  const [uploadResult, setUploadResult] = useState<UploadCSVResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const { mutate: fileMutate } = useMutation<UploadCSVResponse, Error, File>({
    mutationFn: uploadCSV,
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: ['transactions']});
      setUploadResult(data);
      setIsUploading(false);
    },
    onError: (err) => {
      console.error('Upload failed:', err);
      setIsUploading(false);
      setUploadResult({
        created: [],
        created_count: 0,
        errors: [`Upload failed: ${err.message}`]
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setIsUploading(true);
      setUploadResult(null);
      fileMutate(event.target.files[0]);
    }
  };

  const clearResults = () => {
    setUploadResult(null);
  };

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
      
      {uploadResult && (
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

  return (
    <div className="page-container">
      <h1>Transactions</h1>
      <CsvUpload className="page-section" />
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
        filters: filters,
        onFilterChange: handleFilterChange,
      })}/>
    </div>
  );
}