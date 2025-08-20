import React, { useState, useEffect, useRef } from 'react';
import ThinkingBudget from './ThinkingBudget';

const ThinkingBudgetWrapper = ({ initialBudget, onBudgetChange }) => {
    const [localBudget, setLocalBudget] = useState(initialBudget);
    const budgetRef = useRef(localBudget);
  
    useEffect(() => {
      setLocalBudget(initialBudget);
      budgetRef.current = initialBudget;
    }, [initialBudget]);
  
    useEffect(() => {
      budgetRef.current = localBudget;
    }, [localBudget]);
  
    useEffect(() => {
      return () => {
        if (onBudgetChange) {
          onBudgetChange(budgetRef.current);
        }
      };
    }, [onBudgetChange]);
    
    const handleSetBudget = (value) => {
      setLocalBudget(value);
    };
    
    return <ThinkingBudget budget={localBudget} setBudget={handleSetBudget} />;
};

export default ThinkingBudgetWrapper;