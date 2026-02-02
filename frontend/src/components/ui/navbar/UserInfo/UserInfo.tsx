import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../../../contexts/AuthContext';
import './UserInfo.css';

interface UserInfoProps {
  user: User;
  onNavigate: (view: string) => void;
}

export const UserInfo: React.FC<UserInfoProps> = ({ user, onNavigate }) => {
  const navigate = useNavigate();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return { icon: '👑', class: 'role-admin', text: 'Admin' };
      case 'premium': return { icon: '⭐', class: 'role-premium', text: 'Premium' };
      default: return { icon: '👤', class: 'role-user', text: 'Free' };
    }
  };

  const roleBadge = getRoleBadge(user.role);

  const handleClick = () => {
    navigate('/profile');
    onNavigate('profile');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="user-info"
    >
      <span className="user-role-badge">
        <span className={`role-dot ${roleBadge.class}`}></span>
        <span className="role-text">{roleBadge.text}</span>
      </span>
      <span className="user-name">
        {user.name || user.email}
      </span>
    </button>
  );
};
