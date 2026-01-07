"""
Test file for right side of diff comparison
"""

def calculate_sum(a, b, c=0):
    """Calculate the sum of two or three numbers"""
    return a + b + c


def calculate_product(a, b):
    """Calculate the product of two numbers"""
    return a * b


def calculate_division(a, b):
    """Calculate the division of two numbers"""
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b


class Calculator:
    def __init__(self):
        self.result = 0
        self.history = []

    def add(self, value):
        """Add a value to the result"""
        self.result += value
        self.history.append(f"add {value}")
        return self.result

    def subtract(self, value):
        """Subtract a value from the result"""
        self.result -= value
        self.history.append(f"subtract {value}")
        return self.result

    def multiply(self, value):
        """Multiply the result by a value"""
        self.result *= value
        self.history.append(f"multiply {value}")
        return self.result

    def reset(self):
        """Reset the calculator"""
        self.result = 0
        self.history.clear()


def process_data(data):
    """Process a list of data"""
    processed = []
    for item in data:
        if item > 0:
            processed.append(item * 3)
        elif item < 0:
            processed.append(item)
        else:
            processed.append(0)
    return processed


if __name__ == "__main__":
    calc = Calculator()
    calc.add(10)
    calc.multiply(2)
    calc.subtract(5)
    print(f"Result: {calc.result}")
    print(f"History: {calc.history}")

    numbers = [1, 2, 3, 4, 5]
    result = process_data(numbers)
    print(f"Processed: {result}")
