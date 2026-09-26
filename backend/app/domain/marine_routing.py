import math
import heapq
import logging
from typing import List, Tuple, Optional, Any, Callable
from shapely.geometry import Point, LineString

logger = logging.getLogger(__name__)

class Node:
    def __init__(self, x: float, y: float):
        self.x = round(x, 4)
        self.y = round(y, 4)
        self.g = float('inf')
        self.h = 0.0
        self.f = float('inf')
        self.parent = None
        
    def __lt__(self, other):
        return self.f < other.f
        
    def __eq__(self, other):
        return self.x == other.x and self.y == other.y
        
    def __hash__(self):
        return hash((self.x, self.y))

def haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class MarinePathfinder:
    def __init__(self, land_polygon, resolution_deg: float = 0.02):
        self.land_polygon = land_polygon
        self.resolution_deg = resolution_deg
        
    def _is_navigable(self, lon: float, lat: float, buffer_deg: float = 0.0) -> bool:
        if not self.land_polygon:
            return True
        pt = Point(lon, lat)
        if buffer_deg > 0:
            return not self.land_polygon.intersects(pt.buffer(buffer_deg))
        return not self.land_polygon.contains(pt)

    def _line_navigable(self, lon1: float, lat1: float, lon2: float, lat2: float) -> bool:
        if not self.land_polygon:
            return True
        line = LineString([(lon1, lat1), (lon2, lat2)])
        return not self.land_polygon.intersects(line)

    def find_path(
        self, 
        start_coords: List[float], 
        end_coords: List[float], 
        safety_buffer_deg: float = 0.0,
        max_iterations: int = 5000,
        current_vector_fn: Optional[Any] = None,
        craft_speed_knots: float = 8.0,
    ) -> Optional[List[List[float]]]:
        """
        A* Pathfinding on a dynamic grid to route around land and optimize against surface currents.
        Returns a list of [lon, lat] waypoints.
        """
        start_node = Node(start_coords[0], start_coords[1])
        end_node = Node(end_coords[0], end_coords[1])
        
        # If direct path is clear and no current vectors to optimize against, return it
        if current_vector_fn is None and self._line_navigable(start_node.x, start_node.y, end_node.x, end_node.y):
            return [start_coords, end_coords]

        open_set = []
        closed_set = set()
        
        start_node.g = 0
        start_node.h = haversine(start_node.x, start_node.y, end_node.x, end_node.y)
        start_node.f = start_node.h
        
        heapq.heappush(open_set, start_node)
        
        # To snap coordinates to grid properly during neighbor generation
        # We define movement directions (8-way)
        directions = [
            (0, self.resolution_deg), (0, -self.resolution_deg),
            (self.resolution_deg, 0), (-self.resolution_deg, 0),
            (self.resolution_deg, self.resolution_deg), (self.resolution_deg, -self.resolution_deg),
            (-self.resolution_deg, self.resolution_deg), (-self.resolution_deg, -self.resolution_deg)
        ]
        
        iterations = 0
        best_node = start_node
        
        nodes_dict = { (start_node.x, start_node.y): start_node }

        while open_set and iterations < max_iterations:
            current = heapq.heappop(open_set)
            iterations += 1
            
            # If we reached the destination (within 1 resolution step)
            dist_to_end = haversine(current.x, current.y, end_node.x, end_node.y)
            if dist_to_end < (self.resolution_deg * 111 * 1.5):
                # End reached
                end_node.parent = current
                best_node = end_node
                break
                
            if current.h < best_node.h:
                best_node = current
                
            closed_set.add((current.x, current.y))
            
            for dx, dy in directions:
                nx, ny = round(current.x + dx, 4), round(current.y + dy, 4)
                
                if (nx, ny) in closed_set:
                    continue
                    
                # Check navigability
                if not self._is_navigable(nx, ny, safety_buffer_deg):
                    continue
                    
                # Create or get neighbor
                if (nx, ny) not in nodes_dict:
                    neighbor = Node(nx, ny)
                    nodes_dict[(nx, ny)] = neighbor
                else:
                    neighbor = nodes_dict[(nx, ny)]
                
                step_dist = haversine(current.x, current.y, nx, ny)
                time_factor = 1.0
                if current_vector_fn is not None:
                    v_dx = nx - current.x
                    v_dy = ny - current.y
                    v_mag = math.hypot(v_dx, v_dy)
                    if v_mag > 1e-6:
                        u_head = v_dx / v_mag
                        v_head = v_dy / v_mag
                        mid_x = (current.x + nx) / 2.0
                        mid_y = (current.y + ny) / 2.0
                        try:
                            u_curr, v_curr = current_vector_fn(mid_x, mid_y)
                            v_along = (u_curr * u_head) + (v_curr * v_head)
                            eff_speed = max(1.0, craft_speed_knots + v_along)
                            time_factor = craft_speed_knots / eff_speed
                        except Exception:
                            time_factor = 1.0

                tentative_g = current.g + (step_dist * time_factor)
                
                # Penalize changing direction to encourage straight lines
                if current.parent:
                    dx1 = current.x - current.parent.x
                    dy1 = current.y - current.parent.y
                    if abs(dx - dx1) > 0.0001 or abs(dy - dy1) > 0.0001:
                        tentative_g += 0.5 # Penalty for turning
                
                if tentative_g < neighbor.g:
                    neighbor.parent = current
                    neighbor.g = tentative_g
                    neighbor.h = haversine(nx, ny, end_node.x, end_node.y)
                    neighbor.f = neighbor.g + neighbor.h
                    
                    if neighbor not in open_set:
                        heapq.heappush(open_set, neighbor)

        # Reconstruct path
        path = []
        curr = best_node
        while curr:
            path.append([curr.x, curr.y])
            curr = curr.parent
        path.reverse()
        
        # If we didn't strictly reach the end node but got close, ensure end is appended
        if best_node != end_node and len(path) > 1:
            path.append(end_coords)
            
        # Simplify path using Ramer-Douglas-Peucker via Shapely
        if len(path) > 2:
            line = LineString(path)
            simplified = line.simplify(self.resolution_deg * 0.5, preserve_topology=False)
            if isinstance(simplified, LineString):
                path = [[round(x, 4), round(y, 4)] for x, y in simplified.coords]
            
        # Replace the first node with exact start coords
        if path:
            path[0] = start_coords
            path[-1] = end_coords
            
        return path
