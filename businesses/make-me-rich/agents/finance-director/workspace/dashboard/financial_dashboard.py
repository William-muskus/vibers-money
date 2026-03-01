#!/usr/bin/env python3
"""
Financial Dashboard for CEO - Provides key financial metrics and insights.
"""

import json
from datetime import datetime

def load_data():
    """Load all financial data."""
    with open('data/budget.json', 'r') as f:
        budget_data = json.load(f)
    
    with open('data/expenses.json', 'r') as f:
        expenses_data = json.load(f)
    
    with open('data/revenue_forecast.json', 'r') as f:
        revenue_data = json.load(f)
    
    return budget_data, expenses_data, revenue_data

def get_budget_summary():
    """Get budget summary metrics."""
    budget_data, expenses_data, revenue_data = load_data()
    
    monthly_budget = budget_data["budget"]["monthly"]
    total_monthly_budget = sum(monthly_budget.values())
    
    # Calculate current spending
    spending = {cat: 0 for cat in budget_data["categories"]}
    for expense in expenses_data["expenses"]:
        spending[expense["category"]] += expense["amount"]
    
    total_spent = sum(spending.values())
    budget_utilization = (total_spent / total_monthly_budget) * 100 if total_monthly_budget > 0 else 0
    
    return {
        "total_budget": total_monthly_budget,
        "total_spent": total_spent,
        "utilization": round(budget_utilization, 2),
        "remaining": total_monthly_budget - total_spent
    }

def get_revenue_summary():
    """Get revenue summary metrics."""
    budget_data, expenses_data, revenue_data = load_data()
    
    current_month = expenses_data["current_month"]
    forecast = revenue_data["forecasts"]["monthly"].get(current_month, 0)
    
    return {
        "current_month": current_month,
        "forecasted_revenue": forecast,
        "next_month_forecast": revenue_data["forecasts"]["monthly"].get(
            list(revenue_data["forecasts"]["monthly"].keys())[1] if len(revenue_data["forecasts"]["monthly"]) > 1 else current_month,
            0
        )
    }

def get_cash_flow_summary():
    """Get cash flow metrics."""
    budget_data, expenses_data, revenue_data = load_data()
    
    budget_summary = get_budget_summary()
    revenue_summary = get_revenue_summary()
    
    cash_flow = revenue_summary["forecasted_revenue"] - budget_summary["total_spent"]
    
    return {
        "cash_flow": cash_flow,
        "cash_flow_status": "positive" if cash_flow >= 0 else "negative",
        "cash_flow_percentage": round((cash_flow / revenue_summary["forecasted_revenue"]) * 100, 2) if revenue_summary["forecasted_revenue"] > 0 else 0
    }

def get_category_breakdown():
    """Get spending breakdown by category."""
    budget_data, expenses_data, revenue_data = load_data()
    
    monthly_budget = budget_data["budget"]["monthly"]
    
    # Calculate current spending
    spending = {cat: 0 for cat in budget_data["categories"]}
    for expense in expenses_data["expenses"]:
        spending[expense["category"]] += expense["amount"]
    
    breakdown = []
    for category in budget_data["categories"]:
        budget = monthly_budget[category]
        spent = spending[category]
        percentage = (spent / budget) * 100 if budget > 0 else 0
        
        breakdown.append({
            "category": category,
            "budget": budget,
            "spent": spent,
            "percentage": round(percentage, 2),
            "status": "on_track" if percentage < 80 else "warning" if percentage < 90 else "alert"
        })
    
    return breakdown

def get_alerts():
    """Get budget alerts."""
    budget_data, expenses_data, revenue_data = load_data()
    
    monthly_budget = budget_data["budget"]["monthly"]
    
    # Calculate current spending
    spending = {cat: 0 for cat in budget_data["categories"]}
    for expense in expenses_data["expenses"]:
        spending[expense["category"]] += expense["amount"]
    
    alerts = []
    
    for category in budget_data["categories"]:
        budget = monthly_budget[category]
        spent = spending[category]
        percentage = (spent / budget) * 100 if budget > 0 else 0
        
        if percentage >= budget_data["thresholds"]["critical"]:
            alerts.append({
                "category": category,
                "type": "CRITICAL",
                "message": f"{category} budget exceeded: ${spent} spent of ${budget} budget ({percentage:.1f}%)"
            })
        elif percentage >= budget_data["thresholds"]["alert"]:
            alerts.append({
                "category": category,
                "type": "ALERT",
                "message": f"{category} budget approaching limit: ${spent} spent of ${budget} budget ({percentage:.1f}%)"
            })
        elif percentage >= budget_data["thresholds"]["warning"]:
            alerts.append({
                "category": category,
                "type": "WARNING",
                "message": f"{category} budget at warning level: ${spent} spent of ${budget} budget ({percentage:.1f}%)"
            })
    
    return alerts

def display_dashboard():
    """Display the financial dashboard."""
    print("=" * 70)
    print("FINANCIAL DASHBOARD - make-me-rich")
    print("=" * 70)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Budget Summary
    print("📊 BUDGET SUMMARY")
    print("-" * 70)
    budget_summary = get_budget_summary()
    print(f"Total Monthly Budget: ${budget_summary['total_budget']:,}")
    print(f"Total Spent: ${budget_summary['total_spent']:,}")
    print(f"Budget Utilization: {budget_summary['utilization']}%")
    print(f"Remaining Budget: ${budget_summary['remaining']:,}")
    print()
    
    # Revenue Summary
    print("💰 REVENUE SUMMARY")
    print("-" * 70)
    revenue_summary = get_revenue_summary()
    print(f"Current Month: {revenue_summary['current_month']}")
    print(f"Forecasted Revenue: ${revenue_summary['forecasted_revenue']:,}")
    print(f"Next Month Forecast: ${revenue_summary['next_month_forecast']:,}")
    print()
    
    # Cash Flow
    print("💳 CASH FLOW")
    print("-" * 70)
    cash_flow = get_cash_flow_summary()
    print(f"Cash Flow: ${cash_flow['cash_flow']:,} ({cash_flow['cash_flow_status']})")
    print(f"Cash Flow % of Revenue: {cash_flow['cash_flow_percentage']}%")
    print()
    
    # Category Breakdown
    print("📈 CATEGORY BREAKDOWN")
    print("-" * 70)
    breakdown = get_category_breakdown()
    for item in breakdown:
        status_icon = "⚠️" if item["status"] == "alert" else "⚠️" if item["status"] == "warning" else "✅"
        print(f"{status_icon} {item['category']:15s}: ${item['spent']:,}/${item['budget']:,} ({item['percentage']}%)")
    print()
    
    # Alerts
    alerts = get_alerts()
    if alerts:
        print("⚠️  ALERTS")
        print("-" * 70)
        for alert in alerts:
            print(f"[{alert['type']}] {alert['message']}")
        print()
    
    # Key Metrics
    print("🎯 KEY METRICS")
    print("-" * 70)
    print(f"Profit Margin: N/A (Revenue: ${revenue_summary['forecasted_revenue']:,}, Expenses: ${budget_summary['total_spent']:,})")
    print(f"Burn Rate: ${budget_summary['total_spent']:,}/month")
    print(f"Runway: N/A (No funding data available)")
    print()
    
    print("=" * 70)

if __name__ == "__main__":
    display_dashboard()