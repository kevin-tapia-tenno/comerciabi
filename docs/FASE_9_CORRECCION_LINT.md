# Corrección de lint de la Fase 9

Se difieren las cargas iniciales de compras, referencias y proveedores con `window.setTimeout(..., 0)` y se limpia cada temporizador al desmontar el componente. Esto mantiene la misma lógica funcional y evita la regla `react-hooks/set-state-in-effect`.
