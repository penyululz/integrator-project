
import React, { useState, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Check, 
  X, 
  MoreVertical, 
  Building2, 
  Trash2, 
  Edit2, 
  AlertCircle,
  LayoutGrid,
  List,
  CalendarDays,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function FacilityManagement() {
  const { 
    bookings, 
    facilities, 
    addBooking, 
    updateBooking, 
    removeBooking,
    addFacility,
    updateFacility,
    removeFacility
  } = useStore();

  const [activeTab, setActiveTab] = useState('bookings');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  
  // Modal States
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Form States
  const [bookingForm, setBookingForm] = useState({
    facilityId: '',
    title: '',
    date: '',
    startTime: '',
    endTime: ''
  });

  const [facilityForm, setFacilityForm] = useState({
    name: '',
    capacity: 0,
    type: 'Room',
    description: ''
  });

  // Filtering & Sorting
  const filteredBookings = useMemo(() => {
    return bookings
      .filter(b => {
        const facility = facilities.find(f => f.id === b.facilityId);
        const searchLower = searchQuery.toLowerCase();
        return b.title.toLowerCase().includes(searchLower) || 
               facility?.name.toLowerCase().includes(searchLower);
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [bookings, facilities, searchQuery]);

  const filteredFacilities = useMemo(() => {
    return facilities.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [facilities, searchQuery]);

  // Handlers - Bookings
  const handleSaveBooking = () => {
    if (!bookingForm.facilityId || !bookingForm.date || !bookingForm.startTime || !bookingForm.endTime || !bookingForm.title) {
      toast.error("Please fill in all required fields");
      return;
    }

    const startDateTime = new Date(`${bookingForm.date}T${bookingForm.startTime}`);
    const endDateTime = new Date(`${bookingForm.date}T${bookingForm.endTime}`);

    if (endDateTime <= startDateTime) {
      toast.error("End time must be after start time");
      return;
    }

    // Conflict detection
    const hasConflict = bookings.some(b => 
      b.id !== editingItem?.id &&
      b.facilityId === bookingForm.facilityId && 
      b.status !== 'rejected' &&
      ((startDateTime >= new Date(b.startTime) && startDateTime < new Date(b.endTime)) ||
       (endDateTime > new Date(b.startTime) && endDateTime <= new Date(b.endTime)) ||
       (startDateTime <= new Date(b.startTime) && endDateTime >= new Date(b.endTime)))
    );

    if (hasConflict) {
      toast.error("Conflict detected! This facility is already booked for the selected time.");
      return;
    }

    const bookingData = {
      facilityId: bookingForm.facilityId,
      title: bookingForm.title,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      bookedBy: 'Faris Malek'
    };

    if (editingItem) {
      updateBooking(editingItem.id, bookingData);
      toast.success("Booking updated successfully");
    } else {
      addBooking({
        ...bookingData,
        id: `b_${Date.now()}`,
        status: 'pending',
      });
      toast.success("Booking request submitted successfully");
    }

    setIsBookingModalOpen(false);
    setEditingItem(null);
    setBookingForm({ facilityId: '', title: '', date: '', startTime: '', endTime: '' });
  };

  const handleCancelBooking = (id: string) => {
    removeBooking(id);
    toast.success("Booking cancelled");
  };

  const handleStatusChange = (id: string, status: string) => {
    updateBooking(id, { status });
    toast.success(`Booking ${status}`);
  };

  // Handlers - Facilities
  const handleSaveFacility = () => {
    if (!facilityForm.name || facilityForm.capacity <= 0) {
      toast.error("Please provide a valid name and capacity");
      return;
    }

    if (editingItem) {
      updateFacility(editingItem.id, facilityForm);
      toast.success("Facility updated successfully");
    } else {
      addFacility({
        ...facilityForm,
        id: `f_${Date.now()}`,
      });
      toast.success("Facility added successfully");
    }

    setIsFacilityModalOpen(false);
    setEditingItem(null);
    setFacilityForm({ name: '', capacity: 0, type: 'Room', description: '' });
  };

  const handleDeleteFacility = (id: string) => {
    removeFacility(id);
    toast.success("Facility and its bookings removed");
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Facility Management</h1>
          <p className="text-zinc-500 mt-1">Book rooms, labs, and equipment for your team.</p>
        </div>
        
        <div className="flex gap-3">
          {activeTab === 'bookings' && (
            <Button onClick={() => { setEditingItem(null); setIsBookingModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Plus size={18} />
              New Booking
            </Button>
          )}
          {activeTab === 'facilities' && (
            <Button onClick={() => { setEditingItem(null); setIsFacilityModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Plus size={18} />
              Add Facility
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-6">
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1">
            <TabsTrigger value="bookings" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
              <CalendarDays size={14} /> Bookings
            </TabsTrigger>
            <TabsTrigger value="facilities" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
              <Building2 size={14} /> Facilities
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <Input 
                placeholder={`Search ${activeTab}...`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-200 h-9"
              />
            </div>
            <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-7 w-7", viewMode === 'grid' ? "bg-zinc-800 text-white" : "text-zinc-500")}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid size={14} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-7 w-7", viewMode === 'list' ? "bg-zinc-800 text-white" : "text-zinc-500")}
                onClick={() => setViewMode('list')}
              >
                <List size={14} />
              </Button>
            </div>
          </div>
        </div>

        {/* Bookings Tab */}
        <TabsContent value="bookings" className="space-y-4">
          {filteredBookings.length > 0 ? (
            <div className={cn(
              viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"
            )}>
              {filteredBookings.map((booking) => {
                const facility = facilities.find(f => f.id === booking.facilityId);
                const isPast = new Date(booking.endTime) < new Date();

                return (
                  <Card key={booking.id} className={cn(
                    "bg-zinc-900 border-zinc-800 overflow-hidden transition-all hover:border-zinc-700",
                    isPast && "opacity-60"
                  )}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "p-3 rounded-lg",
                          booking.status === 'approved' ? "bg-emerald-500/10 text-emerald-500" :
                          booking.status === 'pending' ? "bg-amber-500/10 text-amber-500" :
                          "bg-rose-500/10 text-rose-500"
                        )}>
                          <CalendarIcon size={24} />
                        </div>
                        <div>
                          <h4 className="font-bold text-zinc-200">{booking.title}</h4>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-1">
                            <span className="flex items-center gap-1"><CalendarIcon size={12} /> {new Date(booking.startTime).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1"><Clock size={12} /> {new Date(booking.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(booking.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="flex items-center gap-1"><MapPin size={12} /> {facility?.name || 'Unknown Facility'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={cn(
                          "text-[10px] uppercase",
                          booking.status === 'approved' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                          booking.status === 'pending' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                          "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        )}>
                          {booking.status}
                        </Badge>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500" />}>
                            <MoreVertical size={16} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            {booking.status === 'pending' && (
                              <>
                                <DropdownMenuItem onClick={() => handleStatusChange(booking.id, 'approved')} className="gap-2 text-emerald-400 focus:bg-emerald-950">
                                  <Check size={14} /> Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(booking.id, 'rejected')} className="gap-2 text-rose-400 focus:bg-rose-950">
                                  <X size={14} /> Reject
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setEditingItem(booking);
                                  const start = new Date(booking.startTime);
                                  setBookingForm({
                                    facilityId: booking.facilityId,
                                    title: booking.title,
                                    date: start.toISOString().split('T')[0],
                                    startTime: start.toTimeString().slice(0, 5),
                                    endTime: new Date(booking.endTime).toTimeString().slice(0, 5)
                                  });
                                  setIsBookingModalOpen(true);
                                }} className="gap-2 focus:bg-zinc-800">
                                  <Edit2 size={14} /> Edit Booking
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem onClick={() => handleCancelBooking(booking.id)} className="gap-2 text-rose-400 focus:bg-rose-950">
                              <Trash2 size={14} /> Cancel Booking
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center bg-zinc-900 rounded-lg border border-zinc-800">
              <CalendarDays size={48} className="mx-auto text-zinc-800 mb-4" />
              <h3 className="text-lg font-medium text-zinc-400">No bookings found</h3>
              <p className="text-zinc-600 mt-1">Schedule a facility for your next team meeting.</p>
            </div>
          )}
        </TabsContent>

        {/* Facilities Tab */}
        <TabsContent value="facilities" className="space-y-4">
          <div className={cn(
            viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"
          )}>
            {filteredFacilities.map((facility) => (
              <Card key={facility.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-500">
                      <Building2 size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-200">{facility.name}</h4>
                      <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                        <span className="flex items-center gap-1"><Users size={12} /> Capacity: {facility.capacity}</span>
                        <span className="flex items-center gap-1"><Badge variant="outline" className="text-[10px] uppercase border-zinc-800">{facility.type}</Badge></span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-zinc-500"
                      onClick={() => {
                        setEditingItem(facility);
                        setFacilityForm({
                          name: facility.name,
                          capacity: facility.capacity,
                          type: facility.type,
                          description: facility.description || ''
                        });
                        setIsFacilityModalOpen(true);
                      }}
                    >
                      <Edit2 size={16} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-rose-500 hover:bg-rose-950"
                      onClick={() => handleDeleteFacility(facility.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Booking Modal */}
      <Dialog open={isBookingModalOpen} onOpenChange={setIsBookingModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Booking' : 'Create New Booking'}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Reserve a facility for your team.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="b-title">Booking Title</Label>
              <Input 
                id="b-title" 
                value={bookingForm.title}
                onChange={(e) => setBookingForm({...bookingForm, title: e.target.value})}
                placeholder="e.g. Design Review" 
                className="bg-zinc-950 border-zinc-800" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-facility">Facility</Label>
              <Select value={bookingForm.facilityId} onValueChange={(v) => setBookingForm({...bookingForm, facilityId: v})}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue placeholder="Select a facility" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  {facilities.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name} (Cap: {f.capacity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-date">Date</Label>
              <Input 
                id="b-date" 
                type="date" 
                value={bookingForm.date}
                className="bg-zinc-950 border-zinc-800" 
                onChange={(e) => setBookingForm({...bookingForm, date: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="b-startTime">Start Time</Label>
                <Input 
                  id="b-startTime" 
                  type="time" 
                  value={bookingForm.startTime}
                  className="bg-zinc-950 border-zinc-800" 
                  onChange={(e) => setBookingForm({...bookingForm, startTime: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b-endTime">End Time</Label>
                <Input 
                  id="b-endTime" 
                  type="time" 
                  value={bookingForm.endTime}
                  className="bg-zinc-950 border-zinc-800" 
                  onChange={(e) => setBookingForm({...bookingForm, endTime: e.target.value})}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBookingModalOpen(false)} className="bg-zinc-800 border-zinc-700">Cancel</Button>
            <Button onClick={handleSaveBooking} className="bg-indigo-600 hover:bg-indigo-700">{editingItem ? 'Update Booking' : 'Submit Request'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facility Modal */}
      <Dialog open={isFacilityModalOpen} onOpenChange={setIsFacilityModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Facility' : 'Add New Facility'}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Manage facility details and capacity.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="f-name">Facility Name</Label>
              <Input 
                id="f-name" 
                value={facilityForm.name}
                onChange={(e) => setFacilityForm({...facilityForm, name: e.target.value})}
                placeholder="e.g. Conference Room C" 
                className="bg-zinc-950 border-zinc-800" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="f-capacity">Capacity</Label>
                <Input 
                  id="f-capacity" 
                  type="number" 
                  value={facilityForm.capacity}
                  onChange={(e) => setFacilityForm({...facilityForm, capacity: parseInt(e.target.value)})}
                  className="bg-zinc-950 border-zinc-800" 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-type">Type</Label>
                <Select value={facilityForm.type} onValueChange={(v) => setFacilityForm({...facilityForm, type: v})}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="Room">Room</SelectItem>
                    <SelectItem value="Lab">Lab</SelectItem>
                    <SelectItem value="Equipment">Equipment</SelectItem>
                    <SelectItem value="Outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-desc">Description</Label>
              <Input 
                id="f-desc" 
                value={facilityForm.description}
                onChange={(e) => setFacilityForm({...facilityForm, description: e.target.value})}
                placeholder="Optional description..." 
                className="bg-zinc-950 border-zinc-800" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFacilityModalOpen(false)} className="bg-zinc-800 border-zinc-700">Cancel</Button>
            <Button onClick={handleSaveFacility} className="bg-indigo-600 hover:bg-indigo-700">{editingItem ? 'Save Changes' : 'Add Facility'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
