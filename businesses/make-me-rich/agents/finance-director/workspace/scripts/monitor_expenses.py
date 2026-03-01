#!/usr/bin/env python3
"""
Expense monitoring script to track and analyze business expenses.
"""

import json
import os
from datetime import datetime

def load_data():
    """Load budget and expense data."""
    with open('data/budget.json', 'r') as f:
        budget_data = json.load(f)
    
    with open('data/expenses.json', 'r') as f:
        expenses_data = json.load(f)
    
    return budget_data, expenses_data

def save_expenses(expenses_data):
    """Save expenses data."""
    with open('data/expenses.json', 'w') as f:
        json.dump(expenses_data, f, indent=2)

def add_expense(category, amount, description=""):
    """Add a new expense."""
    budget_data, expenses_data = load_data()
    
    expense = {
        "date": datetime.now().isoformat(),
        "category": category,
        "amount": amount,
        "description": description
    }
    
    expenses_data["expenses"].append(expense)
    save_expenses(expenses_data)
    
    return expense

def get_current_spending():
    """Get current spending by category."""
    budget_data, expenses_data = load_data()
    
    spending = {cat: 0 for cat in budget_data["categories"]}
    
    for expense in expenses_data["expenses"]:
        spending[expense["category"]] += expense["amount"]
    
    return spending

def check_budget_thresholds():
    """Check if spending exceeds budget thresholds."""
    budget_data, expenses_data = load_data()
    spending = get_current_spending()
    
    alerts = []
    
    for category in budget_data["categories"]:
        monthly_budget = budget_data["budget"]["monthly"][category]
        current_spending = spending[category]
        
        percentage = current_spending / monthly_budget
        
        if percentage >= budget_data["thresholds"]["critical"]:
            alerts.append({
                "category": category,
                "status": "CRITICAL",
                "spent": current_spending,
                "budget": monthly_budget,
                "percentage": round(percentage * 100, 2)
            })
        elif percentage >= budget_data["thresholds"]["alert"]:
            alerts.append({
                "category": category,
                "status": "ALERT",
                "spent": current_spending,
                "budget": monthly_budget,
                "percentage": round(percentage * 100, 2)
            })
        elif percentage >= budget_data["thresholds"]["warning"]:
            alerts.append({
                "category": category,
                "status": "WARNING",
                "spent": current_spending,
                "budget": monthly_budget,
                "percentage": round(percentage * 100, 2)
            })
    
    return alerts

def generate_expense_report():
    """Generate a comprehensive expense report."""
    budget_data, expenses_data = load_data()
    spending = get_current_spending()
    alerts = check_budget_thresholds()
    
    report = {
        "date": datetime.now().isoformat(),
        "current_month": expenses_data["current_month"],
        "total_expenses": sum(spending.values()),
        "spending_by_category": spending,
        "budget_by_category": budget_data["budget"]["monthly"],
        "alerts": alerts,
        "total_budget": sum(budget_data["budget"]["monthly"].values())
    }
    
    return report

if __name__ == "__main__":
    print("Expense Monitoring System")
    print("=" * 50)
    
    # Generate and display report
    report = generate_expense_report()
    
    print(f"\nCurrent Month: {report['current_month']}")
    print(f"Total Expenses: ${report['total_expenses']}")
    print(f"Total Budget: ${report['total_budget']}")
    print(f"Budget Utilization: {report['total_expenses'] / report['total_budget'] * 100:.2f}%")
    
    print("\nSpending by Category:")
    for category in report["spending_by_category"]:
        spent = report["spending_by_category"][category]
        budget = report["budget_by_category"][category]
        print(f"  {category}: ${spent} / ${budget} ({spent/budget*100:.1f}%)")
    
    if report["alerts"]:
        print("\nAlerts:")
        for alert in report["alerts"]:
            print(f"  [{alert['status']}] {alert['category']}: ${alert['spent']} / ${alert['budget']} ({alert['percentage']}%)")
    else:
        print("\nNo budget alerts.")