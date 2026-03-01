#!/usr/bin/env python3
"""
Budget Alert System - Monitors spending and sends alerts when thresholds are exceeded.
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

def save_alerts(alerts):
    """Save alerts to file."""
    with open('data/alerts.json', 'w') as f:
        json.dump(alerts, f, indent=2)

def check_thresholds():
    """Check if spending exceeds budget thresholds."""
    budget_data, expenses_data = load_data()
    
    # Calculate current spending
    spending = {cat: 0 for cat in budget_data["categories"]}
    for expense in expenses_data["expenses"]:
        spending[expense["category"]] += expense["amount"]
    
    alerts = []
    
    for category in budget_data["categories"]:
        monthly_budget = budget_data["budget"]["monthly"][category]
        current_spending = spending[category]
        
        percentage = current_spending / monthly_budget if monthly_budget > 0 else 0
        
        # Check thresholds
        if percentage >= budget_data["thresholds"]["critical"]:
            alert_type = "CRITICAL"
            message = f"CRITICAL: {category} budget EXCEEDED! ${current_spending} spent of ${monthly_budget} budget ({percentage*100:.1f}%)"
            severity = 3
        elif percentage >= budget_data["thresholds"]["alert"]:
            alert_type = "ALERT"
            message = f"ALERT: {category} budget approaching limit! ${current_spending} spent of ${monthly_budget} budget ({percentage*100:.1f}%)"
            severity = 2
        elif percentage >= budget_data["thresholds"]["warning"]:
            alert_type = "WARNING"
            message = f"WARNING: {category} budget at warning level! ${current_spending} spent of ${monthly_budget} budget ({percentage*100:.1f}%)"
            severity = 1
        else:
            continue
        
        alert = {
            "timestamp": datetime.now().isoformat(),
            "category": category,
            "type": alert_type,
            "severity": severity,
            "message": message,
            "spent": current_spending,
            "budget": monthly_budget,
            "percentage": round(percentage * 100, 2),
            "resolved": False
        }
        
        alerts.append(alert)
    
    return alerts

def get_unresolved_alerts():
    """Get unresolved alerts from file."""
    if not os.path.exists('data/alerts.json'):
        return []
    
    with open('data/alerts.json', 'r') as f:
        alerts = json.load(f)
    
    return [alert for alert in alerts if not alert.get("resolved", False)]

def send_alerts(alerts):
    """Send alerts (currently prints to console and saves to file)."""
    if not alerts:
        print("No budget alerts to send.")
        return
    
    print("\n" + "=" * 70)
    print("BUDGET ALERTS - make-me-rich")
    print("=" * 70)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Group by severity
    critical = [a for a in alerts if a["severity"] == 3]
    alert = [a for a in alerts if a["severity"] == 2]
    warning = [a for a in alerts if a["severity"] == 1]
    
    if critical:
        print("🔴 CRITICAL ALERTS")
        print("-" * 70)
        for alert_item in critical:
            print(f"[{alert_item['timestamp']}] {alert_item['message']}")
        print()
    
    if alert:
        print("🟠 ALERTS")
        print("-" * 70)
        for alert_item in alert:
            print(f"[{alert_item['timestamp']}] {alert_item['message']}")
        print()
    
    if warning:
        print("🟡 WARNINGS")
        print("-" * 70)
        for alert_item in warning:
            print(f"[{alert_item['timestamp']}] {alert_item['message']}")
        print()
    
    # Save alerts
    save_alerts(alerts)
    
    print("=" * 70)
    print(f"Total alerts generated: {len(alerts)}")
    print("=" * 70)

def monitor_and_alert():
    """Main monitoring function."""
    # Check current thresholds
    current_alerts = check_thresholds()
    
    # Get unresolved alerts from previous runs
    unresolved_alerts = get_unresolved_alerts()
    
    # Combine and deduplicate alerts
    all_alerts = current_alerts + unresolved_alerts
    
    # Remove duplicates (keep most recent)
    unique_alerts = {}
    for alert in all_alerts:
        key = alert["category"]
        if key not in unique_alerts or alert["timestamp"] > unique_alerts[key]["timestamp"]:
            unique_alerts[key] = alert
    
    unique_alerts_list = list(unique_alerts.values())
    
    # Send alerts
    send_alerts(unique_alerts_list)
    
    return unique_alerts_list

def resolve_alert(category):
    """Mark an alert as resolved."""
    alerts = get_unresolved_alerts()
    
    for alert in alerts:
        if alert["category"] == category:
            alert["resolved"] = True
            alert["resolved_timestamp"] = datetime.now().isoformat()
            alert["resolution_notes"] = f"Resolved on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            break
    
    save_alerts(alerts)
    print(f"Alert for {category} has been marked as resolved.")

def main():
    """Main entry point."""
    print("Budget Alert System")
    print("=" * 70)
    
    # Monitor and send alerts
    alerts = monitor_and_alert()
    
    if alerts:
        print("\nAction Required:")
        print("1. Review spending in affected categories")
        print("2. Adjust budgets if necessary")
        print("3. Implement cost-saving measures")
        print("4. Use resolve_alert() function to mark alerts as resolved")

if __name__ == "__main__":
    main()