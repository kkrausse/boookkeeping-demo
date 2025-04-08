import { FC } from 'react';
import './Navbar.css';

interface NavbarProps {
  activePage: string;
  onPageChange: (page: string) => void;
}

export const Navbar: FC<NavbarProps> = ({ activePage, onPageChange }) => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1>Bookkeeping</h1>
      </div>
      <ul className="navbar-nav">
        <li className={`nav-item ${activePage === 'transactions' ? 'active' : ''}`}>
          <button 
            className="nav-link" 
            onClick={() => onPageChange('transactions')}
          >
            Transactions
          </button>
        </li>
        <li className={`nav-item ${activePage === 'rules' ? 'active' : ''}`}>
          <button 
            className="nav-link" 
            onClick={() => onPageChange('rules')}
          >
            Rules
          </button>
        </li>
      </ul>
    </nav>
  );
};