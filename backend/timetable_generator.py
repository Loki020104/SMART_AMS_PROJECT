"""
Timetable Generation Engine
Implements Simulated Annealing and Genetic Algorithm for optimal scheduling
"""

import random
import math
import json
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────
# Data Models
# ────────────────────────────────────────────────────────────────────

@dataclass
class Subject:
    code: str
    name: str
    department: str
    type: str  # 'theory', 'lab', 'tutorial'
    weekly_hours: int
    credits: int

@dataclass
class Faculty:
    id: str
    username: str
    department: str
    max_weekly_classes: int = 5
    free_periods: Dict = None  # {"Monday": [9,10], "Friday": [9,10]}
    no_first_period: bool = False
    max_consecutive_hours: int = 3

@dataclass
class Room:
    number: str
    capacity: int
    type: str  # 'classroom', 'lab', 'seminar'
    has_computers: bool = False
    building: str = ""

@dataclass
class Slot:
    faculty_username: str
    subject_code: str
    day: str  # 'Monday', 'Tuesday', etc.
    period: int  # 1-8
    duration: int = 1  # 1 for theory, 2 for lab
    room: Optional[str] = None
    batch: str = "A"
    session_type: str = "lecture"
    capacity_needed: int = 60

    @property
    def end_period(self) -> int:
        return self.period + self.duration - 1


# ────────────────────────────────────────────────────────────────────
# Constraint Checker
# ────────────────────────────────────────────────────────────────────

class ConstraintChecker:
    """Validates hard and soft constraints"""
    
    def __init__(self, faculty_list: List[Faculty], rooms_list: List[Room],
                 break_schedule: Dict[int, str], department_constraints: Dict = None):
        self.faculty_lookup = {f.username: f for f in faculty_list}
        self.rooms_lookup = {r.number: r for r in rooms_list}
        self.break_schedule = break_schedule  # {1: 'period', 2: 'break', ...}
        self.department_constraints = department_constraints or {}
        self.DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        self.PERIODS = list(range(1, 9))
        
    def check_hard_constraints(self, slots: List[Slot]) -> Tuple[bool, List[str]]:
        """Check if timetable violates hard constraints"""
        violations = []
        
        # 1. No faculty in two places at once
        faculty_schedule = {}
        for slot in slots:
            key = (slot.faculty_username, slot.day, slot.period)
            if key in faculty_schedule:
                violations.append(
                    f"Faculty {slot.faculty_username} has conflict on {slot.day} "
                    f"period {slot.period}"
                )
            for p in range(slot.period, slot.end_period + 1):
                key = (slot.faculty_username, slot.day, p)
                faculty_schedule[key] = slot
                
        # 2. No two classes in same room at same time
        room_schedule = {}
        for slot in slots:
            if slot.room:
                for p in range(slot.period, slot.end_period + 1):
                    key = (slot.room, slot.day, p)
                    if key in room_schedule:
                        violations.append(
                            f"Room {slot.room} double-booked on {slot.day} period {p}"
                        )
                    room_schedule[key] = slot
                    
        # 3. Room capacity must accommodate batch size
        for slot in slots:
            if slot.room:
                room = self.rooms_lookup.get(slot.room)
                if room and room.capacity < slot.capacity_needed:
                    violations.append(
                        f"Room {slot.room} capacity {room.capacity} < "
                        f"required {slot.capacity_needed}"
                    )
                    
        # 4. Lab classes should have >= 2 consecutive periods
        for slot in slots:
            if slot.session_type == 'lab' and slot.duration < 2:
                violations.append(
                    f"Lab {slot.subject_code} for {slot.faculty_username} "
                    f"needs >= 2 consecutive periods, got {slot.duration}"
                )
                
        return len(violations) == 0, violations
    
    def check_soft_constraints(self, slots: List[Slot]) -> Dict[str, int]:
        """Check soft constraints and return penalty scores"""
        penalties = {}
        
        # 1. Faculty free hours (department-based)
        for slot in slots:
            faculty = self.faculty_lookup.get(slot.faculty_username)
            if faculty:
                # Check department constraints
                dept_free = self.department_constraints.get(
                    (faculty.department, slot.day),
                    []
                )
                if slot.period in dept_free:
                    penalties[f"dept_free_{slot.faculty_username}_{slot.day}"] = 10
                    
        # 2. Faculty free periods constraints
        for slot in slots:
            faculty = self.faculty_lookup.get(slot.faculty_username)
            if faculty and faculty.free_periods:
                free_periods = faculty.free_periods.get(slot.day, [])
                if slot.period in free_periods:
                    penalties[f"free_period_{slot.faculty_username}_{slot.day}"] = 5
                    
        # 3. No first period for senior faculty
        for slot in slots:
            faculty = self.faculty_lookup.get(slot.faculty_username)
            if faculty and faculty.no_first_period and slot.period == 1:
                penalties[f"no_first_period_{slot.faculty_username}"] = 3
                
        # 4. Faculty max classes per week
        faculty_weekly = {}
        for slot in slots:
            key = slot.faculty_username
            faculty_weekly[key] = faculty_weekly.get(key, 0) + 1
            
        for faculty_name, count in faculty_weekly.items():
            faculty = self.faculty_lookup.get(faculty_name)
            if faculty and count > faculty.max_weekly_classes:
                extra = count - faculty.max_weekly_classes
                penalties[f"weekly_overload_{faculty_name}"] = extra * 5
                
        # 5. Max consecutive hours without break
        for faculty_name in faculty_weekly:
            consecutive = self._check_consecutive_hours(slots, faculty_name)
            faculty = self.faculty_lookup.get(faculty_name)
            if faculty and consecutive > faculty.max_consecutive_hours:
                penalties[f"consecutive_{faculty_name}"] = \
                    (consecutive - faculty.max_consecutive_hours) * 3
                    
        # 6. Same subject not twice in one day for a batch
        batch_daily = {}
        for slot in slots:
            key = (slot.batch, slot.day)
            subjects = batch_daily.get(key, [])
            if slot.subject_code in subjects:
                penalties[f"duplicate_daily_{slot.batch}_{slot.day}"] = 2
            subjects.append(slot.subject_code)
            batch_daily[key] = subjects
            
        return penalties
    
    def calculate_fitness(self, slots: List[Slot]) -> float:
        """Calculate fitness score (lower is better)"""
        is_valid, hard_violations = self.check_hard_constraints(slots)
        
        if not is_valid:
            return float('inf')  # Invalid timetable
            
        soft_penalties = self.check_soft_constraints(slots)
        total_penalty = sum(soft_penalties.values())
        
        return total_penalty
    
    def _check_consecutive_hours(self, slots: List[Slot], faculty_name: str) -> int:
        """Find max consecutive teaching hours for a faculty"""
        schedule = {}
        for slot in slots:
            if slot.faculty_username == faculty_name:
                if slot.day not in schedule:
                    schedule[slot.day] = []
                for p in range(slot.period, slot.end_period + 1):
                    schedule[slot.day].append(p)
                    
        max_consecutive = 0
        for day in schedule:
            periods = sorted(set(schedule[day]))
            current_consecutive = 1
            for i in range(1, len(periods)):
                if periods[i] == periods[i-1] + 1:
                    current_consecutive += 1
                else:
                    max_consecutive = max(max_consecutive, current_consecutive)
                    current_consecutive = 1
            max_consecutive = max(max_consecutive, current_consecutive)
            
        return max_consecutive


# ────────────────────────────────────────────────────────────────────
# Simulated Annealing Algorithm
# ────────────────────────────────────────────────────────────────────

class SimulatedAnnealingScheduler:
    """Generates timetable using Simulated Annealing"""
    
    def __init__(self, constraint_checker: ConstraintChecker, 
                 iterations: int = 10000, initial_temp: float = 100):
        self.checker = constraint_checker
        self.iterations = iterations
        self.initial_temp = initial_temp
        self.cooling_rate = 0.995
        
    def generate(self, initial_slots: List[Slot]) -> Tuple[List[Slot], float]:
        """Generate optimized timetable"""
        current = initial_slots.copy()
        current_fitness = self.checker.calculate_fitness(current)
        
        best = current.copy()
        best_fitness = current_fitness
        
        temperature = self.initial_temp
        
        for iteration in range(self.iterations):
            # Generate neighbor by moving one slot
            neighbor = self._get_neighbor(current)
            neighbor_fitness = self.checker.calculate_fitness(neighbor)
            
            # Acceptance probability
            delta = neighbor_fitness - current_fitness
            if delta < 0 or random.random() < math.exp(-delta / temperature):
                current = neighbor
                current_fitness = neighbor_fitness
                
                if current_fitness < best_fitness:
                    best = current.copy()
                    best_fitness = current_fitness
                    
            temperature *= self.cooling_rate
            
            if iteration % 100 == 0:
                logger.info(f"Iteration {iteration}: Best={best_fitness:.2f}, "
                           f"Temp={temperature:.2f}")
                
        return best, best_fitness
    
    def _get_neighbor(self, slots: List[Slot]) -> List[Slot]:
        """Generate neighbor solution by moving a slot"""
        neighbor = [s for s in slots]  # Deep copy
        
        # Randomly select a slot to move
        if not neighbor:
            return neighbor
            
        slot_idx = random.randint(0, len(neighbor) - 1)
        slot = neighbor[slot_idx]
        
        # Randomly change day, period, or room
        move_type = random.choice(['day', 'period', 'room'])
        
        if move_type == 'day':
            slot.day = random.choice(self.checker.DAYS)
        elif move_type == 'period':
            slot.period = random.choice(self.checker.PERIODS)
        else:  # room
            slot.room = random.choice(list(self.checker.rooms_lookup.keys()))
            
        return neighbor


# ────────────────────────────────────────────────────────────────────
# Genetic Algorithm
# ────────────────────────────────────────────────────────────────────

class GeneticScheduler:
    """Generates timetable using Genetic Algorithm"""
    
    def __init__(self, constraint_checker: ConstraintChecker,
                 population_size: int = 100, generations: int = 100):
        self.checker = constraint_checker
        self.population_size = population_size
        self.generations = generations
        
    def generate(self, initial_slots: List[Slot]) -> Tuple[List[Slot], float]:
        """Generate optimized timetable using genetic algorithm"""
        population = [self._mutate(initial_slots) for _ in range(self.population_size)]
        
        for generation in range(self.generations):
            # Evaluate fitness
            fitness_scores = [self.checker.calculate_fitness(ind) for ind in population]
            
            # Sort by fitness
            population = [x for _, x in sorted(zip(fitness_scores, population))]
            
            best_fitness = fitness_scores[sorted(enumerate(fitness_scores))[0][0]]
            logger.info(f"Generation {generation}: Best fitness = {best_fitness:.2f}")
            
            # Selection and reproduction
            new_population = population[:len(population)//2]  # Keep best half
            
            while len(new_population) < self.population_size:
                parent1 = random.choice(population[:len(population)//2])
                parent2 = random.choice(population[:len(population)//2])
                child = self._crossover(parent1, parent2)
                child = self._mutate(child)
                new_population.append(child)
                
            population = new_population
            
        # Return best individual
        best = min(population, key=lambda x: self.checker.calculate_fitness(x))
        best_fitness = self.checker.calculate_fitness(best)
        
        return best, best_fitness
    
    def _crossover(self, parent1: List[Slot], parent2: List[Slot]) -> List[Slot]:
        """Combine two timetables"""
        point = len(parent1) // 2
        return parent1[:point] + parent2[point:]
    
    def _mutate(self, slots: List[Slot]) -> List[Slot]:
        """Mutate a timetable"""
        mutated = [s for s in slots]
        
        if random.random() < 0.3:  # 30% mutation rate
            idx = random.randint(0, len(mutated) - 1)
            move_type = random.choice(['day', 'period'])
            
            if move_type == 'day':
                mutated[idx].day = random.choice(self.checker.DAYS)
            else:
                mutated[idx].period = random.choice(self.checker.PERIODS)
                
        return mutated


# ────────────────────────────────────────────────────────────────────
# Timetable Generator (Main Orchestrator)
# ────────────────────────────────────────────────────────────────────

class TimetableGenerator:
    """Orchestrates the entire timetable generation process"""
    
    def __init__(self, database, algorithm: str = 'simulated_annealing'):
        self.db = database
        self.algorithm = algorithm
        self.DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        
    def generate(self, academic_year: str, semester: int) -> Dict:
        """Generate complete timetable"""
        
        # Step 1: Load data from database
        logger.info("Loading data from database...")
        faculty_list, rooms_list, subjects_list, faculty_assignments = \
            self._load_data(academic_year, semester)
            
        if not faculty_list or not rooms_list or not faculty_assignments:
            return {
                'success': False,
                'error': 'Incomplete data: missing faculty, rooms, or assignments'
            }
            
        # Step 2: Build initial timetable
        logger.info("Building initial timetable...")
        initial_slots = self._build_initial_slots(
            faculty_assignments, subjects_list, rooms_list
        )
        
        # Step 3: Load constraints
        logger.info("Loading constraints...")
        faculty_objs = [Faculty(
            id=f['id'],
            username=f['faculty_username'],
            department=f['department'],
            max_weekly_classes=5,
            free_periods=json.loads(f.get('free_periods', '{}'))
        ) for f in faculty_list]
        
        room_objs = [Room(
            number=r['room_number'],
            capacity=r['capacity'],
            type=r.get('type', 'classroom')
        ) for r in rooms_list]
        
        # Step 4: Create constraint checker
        department_constraints = self._load_department_constraints(academic_year, semester)
        checker = ConstraintChecker(faculty_objs, room_objs, {}, department_constraints)
        
        # Step 5: Run optimization algorithm
        logger.info(f"Running {self.algorithm} optimization...")
        if self.algorithm == 'genetic':
            scheduler = GeneticScheduler(checker, generations=100)
        else:
            scheduler = SimulatedAnnealingScheduler(checker, iterations=10000)
            
        optimized_slots, fitness = scheduler.generate(initial_slots)
        
        # Step 6: Validate and save
        is_valid, violations = checker.check_hard_constraints(optimized_slots)
        soft_penalties = checker.check_soft_constraints(optimized_slots)
        
        return {
            'success': is_valid,
            'fitness_score': fitness,
            'violations': violations,
            'soft_penalties': soft_penalties,
            'timetable': optimized_slots,
            'total_slots': len(optimized_slots),
            'algorithm': self.algorithm
        }
    
    def _load_data(self, academic_year: str, semester: int):
        """Load faculty, rooms, subjects, and assignments from database"""
        # This would connect to Supabase and fetch:
        # - All faculty
        # - All rooms
        # - All subjects
        # - Faculty-subject assignments
        return [], [], [], []
    
    def _build_initial_slots(self, assignments, subjects, rooms) -> List[Slot]:
        """Build initial random slot allocation"""
        slots = []
        
        for assignment in assignments:
            subject_info = next((s for s in subjects if s['code'] == assignment['subject_code']), None)
            if not subject_info:
                continue
                
            # Determine number of sessions needed (weekly_hours / duration)
            duration = 2 if subject_info['type'] == 'lab' else 1
            sessions_needed = subject_info['weekly_hours'] // duration
            
            for _ in range(sessions_needed):
                slot = Slot(
                    faculty_username=assignment['faculty_username'],
                    subject_code=assignment['subject_code'],
                    day=random.choice(self.DAYS),
                    period=random.randint(1, 6),  # Avoid last 2 periods initially
                    duration=duration,
                    room=random.choice([r['room_number'] for r in rooms]),
                    batch=assignment.get('section', 'A'),
                    session_type=subject_info['type'],
                    capacity_needed=60
                )
                slots.append(slot)
                
        return slots
    
    def _load_department_constraints(self, academic_year: str, semester: int) -> Dict:
        """Load department free hour constraints"""
        # Map: (department, day) -> [periods]
        department_constraints = {}
        
        # This would be loaded from database
        # Example:
        # department_constraints[('CSE', 'Friday')] = [9, 10]
        # department_constraints[('BBA', 'Wednesday')] = [7, 8]
        
        return department_constraints
