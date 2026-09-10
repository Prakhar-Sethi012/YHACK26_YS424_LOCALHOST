"""
AEGIS-NAV Vehicle Power Dissipation and Battery/Fuel Dynamics Model
-------------------------------------------------------------------
Mathematical Formulation:
--------------------------
1. Longitudinal Tractive Force on an Incline:
   F_gravity = m * g * sin(θ)                 (Gravitational gradient resistance)
   F_rolling = m * g * C_rr * cos(θ)          (Tire / terrain rolling friction)
   F_aero    = 0.5 * ρ * C_d * A * v^2        (Aerodynamic drag)
   F_inertial= m * a                          (Inertial acceleration force)
   F_tractive = F_gravity + F_rolling + F_aero + F_inertial

2. Mechanical Output Power:
   P_mech = max(0, F_tractive * v)

3. Total Electrical Power Draw (Watts):
   P_total = P_avionics + (P_mech / η_drivetrain) + P_thermal_cooling(T)
   where P_thermal_cooling(T) = k_cooling * max(0, T_ambient - T_nominal)^1.5

4. Battery and Fuel Storage Depletion:
   ΔE_battery = P_total * (Δt / 3600)  [Watt-hours]
   Fuel cell acts as auxiliary generator when battery < 25%:
   ΔV_fuel = (P_generator * Δt) / (η_engine * EnergyDensity_fuel)  [Liters]
"""

import math
from typing import Dict, Any


class PowerDissipationModel:
    """
    Physical energy and power consumption model for search-and-rescue rovers.
    """

    GRAVITY = 9.81  # m/s^2

    def __init__(
        self,
        mass_kg: float = 45.0,              # Vehicle mass with payload
        rolling_res_coeff: float = 0.045,   # Rough disaster rubble coefficient
        drag_coeff: float = 0.75,           # Aerodynamic drag
        frontal_area_m2: float = 0.40,      # Frontal area
        air_density: float = 1.225,         # kg/m^3
        drivetrain_efficiency: float = 0.82,# Motor + gearbox efficiency
        base_avionics_watts: float = 35.0,  # Compute, LiDAR, cameras, radio
        battery_capacity_wh: float = 500.0, # 500 Wh Lithium battery
        fuel_capacity_liters: float = 5.0,  # 5.0 L hybrid auxiliary fuel
        fuel_energy_density_wh_l: float = 2400.0 # Usable electrical Wh per Liter
    ):
        self.mass = mass_kg
        self.c_rr = rolling_res_coeff
        self.c_d = drag_coeff
        self.area = frontal_area_m2
        self.rho = air_density
        self.eta = drivetrain_efficiency
        self.p_avionics = base_avionics_watts

        self.battery_max_wh = battery_capacity_wh
        self.battery_wh = battery_capacity_wh

        self.fuel_max_liters = fuel_capacity_liters
        self.fuel_liters = fuel_capacity_liters
        self.fuel_density = fuel_energy_density_wh_l

        self.total_joules_expended = 0.0

    def compute_power_draw(
        self,
        velocity: float,
        acceleration: float,
        slope_radians: float,
        ambient_temp_c: float = 24.0,
    ) -> float:
        """Calculates instantaneous power draw in Watts."""
        # 1. Tractive Forces
        f_gravity = self.mass * self.GRAVITY * math.sin(slope_radians)
        f_rolling = self.mass * self.GRAVITY * self.c_rr * math.cos(slope_radians)
        f_aero = 0.5 * self.rho * self.c_d * self.area * (velocity ** 2)
        f_inertial = self.mass * acceleration

        f_total = f_gravity + f_rolling + f_aero + f_inertial
        p_mech = max(0.0, f_total * velocity)

        # 2. Environmental Thermal HVAC Cooling Load
        # Active chiller fan power increases non-linearly if operating near heat/fire
        p_cooling = 0.0
        if ambient_temp_c > 35.0:
            p_cooling = 1.8 * ((ambient_temp_c - 35.0) ** 1.3)

        # 3. Total Electrical Load
        p_elec = self.p_avionics + (p_mech / self.eta) + p_cooling
        return p_elec

    def step(
        self,
        velocity: float,
        acceleration: float,
        slope_radians: float,
        ambient_temp_c: float,
        dt_seconds: float = 0.05
    ) -> Dict[str, Any]:
        """
        Updates internal energy reserves over time interval dt.
        Returns telemetry breakdown.
        """
        power_watts = self.compute_power_draw(velocity, acceleration, slope_radians, ambient_temp_c)
        energy_wh = power_watts * (dt_seconds / 3600.0)
        self.total_joules_expended += power_watts * dt_seconds

        # Hybrid power routing:
        # If battery is low (< 20%), auxiliary fuel generator engages to recharge battery
        aux_charging_watts = 0.0
        battery_pct = (self.battery_wh / self.battery_max_wh) * 100.0

        if battery_pct < 20.0 and self.fuel_liters > 0.05:
            gen_power = 120.0 # 120W auxiliary fuel generator
            fuel_consumed = (gen_power * (dt_seconds / 3600.0)) / self.fuel_density
            self.fuel_liters = max(0.0, self.fuel_liters - fuel_consumed)
            aux_charging_watts = gen_power

        # Net battery change
        net_power = -power_watts + aux_charging_watts
        delta_battery = net_power * (dt_seconds / 3600.0)
        self.battery_wh = max(0.0, min(self.battery_max_wh, self.battery_wh + delta_battery))

        return {
            "power_watts": power_watts,
            "battery_wh": self.battery_wh,
            "battery_pct": (self.battery_wh / self.battery_max_wh) * 100.0,
            "fuel_liters": self.fuel_liters,
            "fuel_pct": (self.fuel_liters / self.fuel_max_liters) * 100.0,
            "total_energy_kj": self.total_joules_expended / 1000.0,
            "is_critical_reserve": battery_pct < 15.0,
        }
