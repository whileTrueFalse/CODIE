def factorial(n):
    """Calculates the factorial of a number.

    Args:
        n: The number to calculate the factorial of.

    Returns:
        The factorial of n.
    """

    if n < 0:
        raise ValueError("n must be a non-negative integer")

    if n == 0:
        return 1

    factorial = 1
    for i in range(1, n + 1):
        factorial *= i

    return factorial

# Test the factorial function with different numbers
test_numbers = [0, 1, 5, 10]

print("Testing factorial function:")
print("-" * 30)

for num in test_numbers:
    try:
        result = factorial(num)
        print(f"factorial({num}) = {result}")
    except Exception as e:
        print(f"Error with {num}: {str(e)}")

# Test with a negative number to verify error handling
try:
    result = factorial(-1)
    print("factorial(-1) = {result}")
except ValueError as e:
    print(f"Testing error handling with -1: {str(e)}")
