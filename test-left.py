"""
Test file for left side of diff comparison
"""

def calculate_sum(a, b):
    """Calculate the sum of two numbers"""
    return a + b


def calculate_product(a, b):
    """Calculate the product of two numbers"""
    return a * b


class Calculator:
    def __init__(self):
        self.result = 0

    def add(self, value):
        """Add a value to the result"""
        self.result += value
        return self.result

    def subtract(self, value):
        """Subtract a value from the result"""
        self.result -= value
        return self.result

    def reset(self):
        """Reset the calculator"""
        self.result = 0


def process_data(data):
    """Process a list of data"""
    processed = []
    for item in data:
        if item > 0:
            processed.append(item * 2)
        else:
            processed.append(item)
    return processed


if __name__ == "__main__":
    calc = Calculator()
    calc.add(10)
    calc.subtract(5)
    print(f"Result: {calc.result}")

    numbers = [1, 2, 3, 4, 5]
    result = process_data(numbers)
    print(f"Processed: {result}")
