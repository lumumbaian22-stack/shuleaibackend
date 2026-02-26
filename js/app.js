// ============= COMPLETE APPLICATION WITH DELIVERY COMPLETION FLOW =============
// Data Manager Class
class DataManager {
    constructor() {
        this.loadFromStorage();
        this.ensureSampleData();
    }
    
    loadFromStorage() {
        this.users = JSON.parse(localStorage.getItem('letsEatUsers')) || { 
            customers: [], 
            restaurants: [],
            delivery: [] 
        };
        this.pendingRestaurants = JSON.parse(localStorage.getItem('letsEatPending')) || [];
        this.pendingDelivery = JSON.parse(localStorage.getItem('letsEatPendingDelivery')) || [];
        this.approvedRestaurants = JSON.parse(localStorage.getItem('letsEatApproved')) || [];
        this.approvedDelivery = JSON.parse(localStorage.getItem('letsEatApprovedDelivery')) || [];
        this.allOrders = JSON.parse(localStorage.getItem('letsEatOrders')) || [];
        this.activeDeliveries = JSON.parse(localStorage.getItem('letsEatActiveDeliveries')) || [];
        this.completedDeliveries = JSON.parse(localStorage.getItem('letsEatCompletedDeliveries')) || [];
        this.admins = [{ id: 1, email: "admin@letseat.com", password: "admin123", name: "Platform Admin", type: "admin" }];
        this.deliveryLocations = JSON.parse(localStorage.getItem('letsEatDeliveryLocations')) || {};
    }
    
    saveToStorage() {
        localStorage.setItem('letsEatUsers', JSON.stringify(this.users));
        localStorage.setItem('letsEatPending', JSON.stringify(this.pendingRestaurants));
        localStorage.setItem('letsEatPendingDelivery', JSON.stringify(this.pendingDelivery));
        localStorage.setItem('letsEatApproved', JSON.stringify(this.approvedRestaurants));
        localStorage.setItem('letsEatApprovedDelivery', JSON.stringify(this.approvedDelivery));
        localStorage.setItem('letsEatOrders', JSON.stringify(this.allOrders));
        localStorage.setItem('letsEatActiveDeliveries', JSON.stringify(this.activeDeliveries));
        localStorage.setItem('letsEatCompletedDeliveries', JSON.stringify(this.completedDeliveries));
        localStorage.setItem('letsEatDeliveryLocations', JSON.stringify(this.deliveryLocations));
    }
    
    ensureSampleData() {
        // Sample Restaurants
        if (this.approvedRestaurants.length === 0) {
            this.approvedRestaurants = [
                {
                    id: 1,
                    name: "Sunrise Hotel & Restaurant",
                    owner: "James Kamau",
                    email: "sunrise@example.com",
                    phone: "0712 123 456",
                    location: "Nairobi CBD",
                    lat: -1.2921,
                    lng: 36.8219,
                    distance: 0.5,
                    openTime: "7:00 AM",
                    closeTime: "10:00 PM",
                    isOpen: true,
                    deliveryAvailable: true,
                    deliveryFee: 50,
                    priceRange: "KSh 200 - 1,200",
                    rating: 4.5,
                    reviews: 128,
                    status: "approved",
                    password: "password123",
                    menu: [
                        { id: 1, name: "Full English Breakfast", category: "Breakfast", price: 850, available: true, description: "Eggs, bacon, sausages, beans, toast" },
                        { id: 2, name: "Pancakes with Maple Syrup", category: "Breakfast", price: 450, available: true, description: "Fresh pancakes with syrup and butter" },
                        { id: 3, name: "Coffee", category: "Drinks", price: 150, available: true, description: "Freshly brewed coffee" },
                        { id: 4, name: "Fresh Orange Juice", category: "Drinks", price: 250, available: true, description: "Freshly squeezed orange juice" },
                        { id: 5, name: "Grilled Chicken Burger", category: "Lunch", price: 650, available: true, description: "Burger with grilled chicken and vegetables" },
                        { id: 6, name: "Vegetable Pizza", category: "Lunch", price: 950, available: false, description: "12-inch pizza with assorted vegetables" }
                    ]
                },
                {
                    id: 2,
                    name: "Downtown Diner",
                    owner: "Mary Wanjiku",
                    email: "downtown@example.com",
                    phone: "0733 987 654",
                    location: "Nairobi West",
                    lat: -1.2935,
                    lng: 36.8235,
                    distance: 1.2,
                    openTime: "6:00 AM",
                    closeTime: "11:00 PM",
                    isOpen: true,
                    deliveryAvailable: true,
                    deliveryFee: 70,
                    priceRange: "KSh 150 - 900",
                    rating: 4.2,
                    reviews: 89,
                    status: "approved",
                    password: "password123",
                    menu: [
                        { id: 7, name: "Cheeseburger", category: "Lunch", price: 550, available: true, description: "Beef burger with cheese and fries" },
                        { id: 8, name: "French Fries", category: "Sides", price: 250, available: true, description: "Crispy potato fries" },
                        { id: 9, name: "Milkshake", category: "Drinks", price: 350, available: true, description: "Chocolate or vanilla milkshake" },
                        { id: 10, name: "Chicken Wings", category: "Lunch", price: 750, available: true, description: "Spicy chicken wings with dip" }
                    ]
                }
            ];
        }
        
        // Sample Pending Restaurants
        if (this.pendingRestaurants.length === 0) {
            this.pendingRestaurants = [
                {
                    id: 1001,
                    name: "Kilimani Grill House",
                    owner: "Peter Mwangi",
                    email: "peter@kilimanigrill.com",
                    phone: "0723 456 789",
                    location: "Kilimani, Nairobi",
                    dateApplied: new Date().toISOString().split('T')[0],
                    description: "Premium grilled meats and local cuisine",
                    status: "pending",
                    password: "password123"
                }
            ];
        }
        
        // Sample Delivery Personnel
        if (this.approvedDelivery.length === 0) {
            this.approvedDelivery = [
                {
                    id: 1,
                    name: "John Doe",
                    email: "john@delivery.com",
                    phone: "0712 345 678",
                    vehicle: "motorcycle",
                    plate: "Kxx 123A",
                    location: "Nairobi, Kenya",
                    status: "online",
                    rating: 4.9,
                    deliveries: 156,
                    earnings: 45600,
                    password: "password123"
                },
                {
                    id: 2,
                    name: "Peter Mwangi",
                    email: "peter@delivery.com",
                    phone: "0722 456 789",
                    vehicle: "bicycle",
                    plate: "",
                    location: "Nairobi, Kenya",
                    status: "offline",
                    rating: 4.7,
                    deliveries: 89,
                    earnings: 23400,
                    password: "password123"
                }
            ];
        }
        
        // Sample Pending Delivery Personnel
        if (this.pendingDelivery.length === 0) {
            this.pendingDelivery = [
                {
                    id: 1001,
                    name: "Samuel Kariuki",
                    email: "samuel@delivery.com",
                    phone: "0711 222 333",
                    vehicle: "motorcycle",
                    plate: "Kyy 456B",
                    location: "Nairobi, Kenya",
                    idNumber: "12345678",
                    dateApplied: new Date().toISOString().split('T')[0],
                    status: "pending",
                    password: "password123"
                }
            ];
        }
        
        // Sample Orders
        if (this.allOrders.length === 0) {
            this.allOrders = [
                { 
                    id: 1, 
                    restaurantId: 1, 
                    restaurantName: "Sunrise Hotel & Restaurant",
                    restaurantLat: -1.2921,
                    restaurantLng: 36.8219,
                    customerId: 1,
                    customerName: "John Doe", 
                    customerPhone: "0712 345 678",
                    customerLocation: "Kimathi Street, Nairobi",
                    customerLat: -1.2865,
                    customerLng: 36.8235,
                    items: [
                        { name: "Full English Breakfast", price: 850, quantity: 1 },
                        { name: "Coffee", price: 150, quantity: 1 }
                    ], 
                    total: 1000, 
                    status: "preparing", 
                    deliveryStatus: "pending",
                    date: new Date().toISOString(),
                    tracking: [
                        { step: "Order Received", time: "10:30 AM", completed: true },
                        { step: "Preparing", time: "10:35 AM", completed: true },
                        { step: "Ready for Dispatch", time: "11:00 AM", completed: false },
                        { step: "Dispatched", time: "", completed: false },
                        { step: "Delivered", time: "", completed: false }
                    ]
                }
            ];
        }
        
        this.saveToStorage();
    }
    
    // Customer Methods
    addCustomer(customer) {
        customer.id = this.users.customers.length + 1;
        customer.dateJoined = new Date().toISOString();
        customer.type = 'customer';
        this.users.customers.push(customer);
        this.saveToStorage();
        return customer;
    }
    
    findCustomerByPhone(phone) {
        return this.users.customers.find(c => c.phone === phone);
    }
    
    // Restaurant Methods
    findRestaurantByEmail(email) {
        return this.approvedRestaurants.find(r => r.email === email);
    }
    
    addPendingRestaurant(restaurant) {
        restaurant.id = Date.now();
        restaurant.dateApplied = new Date().toISOString().split('T')[0];
        restaurant.status = 'pending';
        this.pendingRestaurants.push(restaurant);
        this.saveToStorage();
        return restaurant;
    }
    
    approveRestaurant(pendingId) {
        const index = this.pendingRestaurants.findIndex(r => r.id === pendingId);
        if (index === -1) return null;
        
        const pending = this.pendingRestaurants[index];
        const approved = {
            ...pending,
            id: this.approvedRestaurants.length + 1,
            lat: -1.2921 + (Math.random() * 0.01),
            lng: 36.8219 + (Math.random() * 0.01),
            distance: 0.5 + (Math.random() * 2),
            openTime: "8:00 AM",
            closeTime: "10:00 PM",
            isOpen: true,
            deliveryAvailable: true,
            deliveryFee: 50,
            priceRange: "KSh 150 - 1,000",
            rating: 4.0 + (Math.random() * 1),
            reviews: Math.floor(Math.random() * 100),
            status: "approved",
            menu: [
                { id: 1, name: "Sample Item 1", category: "Main", price: 500, available: true, description: "Delicious sample item" },
                { id: 2, name: "Sample Item 2", category: "Main", price: 600, available: true, description: "Another tasty option" }
            ]
        };
        
        this.approvedRestaurants.push(approved);
        this.pendingRestaurants.splice(index, 1);
        this.saveToStorage();
        return approved;
    }
    
    rejectRestaurant(pendingId) {
        const index = this.pendingRestaurants.findIndex(r => r.id === pendingId);
        if (index === -1) return false;
        this.pendingRestaurants.splice(index, 1);
        this.saveToStorage();
        return true;
    }
    
    getRestaurantOrders(restaurantId) {
        return this.allOrders.filter(o => o.restaurantId === restaurantId);
    }
    
    // Delivery Person Methods
    addDeliveryPerson(delivery) {
        delivery.id = this.pendingDelivery.length + this.approvedDelivery.length + 1;
        delivery.dateApplied = new Date().toISOString().split('T')[0];
        delivery.status = "pending";
        this.pendingDelivery.push(delivery);
        this.saveToStorage();
        return delivery;
    }
    
    findDeliveryPersonByEmail(email) {
        return this.approvedDelivery.find(d => d.email === email);
    }
    
    findDeliveryPersonById(id) {
        return this.approvedDelivery.find(d => d.id === id);
    }
    
    approveDeliveryPerson(pendingId) {
        const index = this.pendingDelivery.findIndex(d => d.id === pendingId);
        if (index === -1) return null;
        
        const pending = this.pendingDelivery[index];
        const approved = {
            ...pending,
            id: this.approvedDelivery.length + 1,
            status: "offline",
            rating: 5.0,
            deliveries: 0,
            earnings: 0
        };
        
        this.approvedDelivery.push(approved);
        this.pendingDelivery.splice(index, 1);
        this.saveToStorage();
        return approved;
    }
    
    rejectDeliveryPerson(pendingId) {
        const index = this.pendingDelivery.findIndex(d => d.id === pendingId);
        if (index === -1) return false;
        this.pendingDelivery.splice(index, 1);
        this.saveToStorage();
        return true;
    }
    
    // Order Methods
    addOrder(order) {
        order.id = this.allOrders.length + 1;
        order.date = new Date().toISOString();
        this.allOrders.push(order);
        this.saveToStorage();
        return order;
    }
    
    getOrdersReadyForDelivery() {
        return this.allOrders.filter(o => 
            o.status === 'ready' && 
            o.deliveryStatus === 'pending' &&
            o.customerLat && o.customerLng
        );
    }
    
    getCustomerOrders(customerId) {
        return this.allOrders.filter(o => o.customerId === customerId);
    }
    
    getActiveCustomerOrder(customerId) {
        return this.allOrders.find(o => o.customerId === customerId && o.status !== 'delivered');
    }
    
    assignDeliveryToOrder(orderId, deliveryPersonId) {
        const order = this.allOrders.find(o => o.id === orderId);
        if (!order) return null;
        
        order.deliveryPersonId = deliveryPersonId;
        order.deliveryStatus = 'assigned';
        order.status = 'dispatched';
        order.tracking[2].completed = true;
        order.tracking[3] = { 
            step: "Dispatched", 
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
            completed: true 
        };
        
        const activeDelivery = {
            id: this.activeDeliveries.length + 1,
            orderId: order.id,
            deliveryPersonId: deliveryPersonId,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            customerLocation: order.customerLocation,
            customerLat: order.customerLat,
            customerLng: order.customerLng,
            restaurantName: order.restaurantName,
            restaurantLat: order.restaurantLat,
            restaurantLng: order.restaurantLng,
            status: 'picked_up',
            startTime: new Date().toISOString(),
            eta: 15,
            deliveryFee: 150 // Fixed delivery fee
        };
        
        this.activeDeliveries.push(activeDelivery);
        
        this.deliveryLocations[deliveryPersonId] = {
            lat: order.restaurantLat,
            lng: order.restaurantLng,
            lastUpdate: new Date().toISOString()
        };
        
        this.saveToStorage();
        return activeDelivery;
    }
    
    updateDeliveryLocation(deliveryPersonId, lat, lng) {
        if (this.deliveryLocations[deliveryPersonId]) {
            this.deliveryLocations[deliveryPersonId] = {
                lat: lat,
                lng: lng,
                lastUpdate: new Date().toISOString()
            };
            this.saveToStorage();
        }
    }
    
    getDeliveryLocation(deliveryPersonId) {
        return this.deliveryLocations[deliveryPersonId] || null;
    }
    
    getActiveDeliveryForDeliveryPerson(deliveryPersonId) {
        return this.activeDeliveries.find(d => d.deliveryPersonId === deliveryPersonId);
    }
    
    getActiveDeliveryForCustomer(orderId) {
        return this.activeDeliveries.find(d => d.orderId === orderId);
    }
    
    // ============= COMPLETE DELIVERY METHOD - ALL PARTIES NOTIFIED =============
    completeDelivery(orderId, deliveryPersonId) {
        // Find the order
        const order = this.allOrders.find(o => o.id === orderId);
        if (!order) return null;
        
        // Find the active delivery
        const activeDeliveryIndex = this.activeDeliveries.findIndex(d => d.orderId === orderId);
        if (activeDeliveryIndex === -1) return null;
        
        const activeDelivery = this.activeDeliveries[activeDeliveryIndex];
        
        // Update order status
        order.status = 'delivered';
        order.deliveryStatus = 'delivered';
        order.completedAt = new Date().toISOString();
        order.tracking[4] = { 
            step: "Delivered", 
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
            completed: true 
        };
        
        // Calculate delivery time
        const startTime = new Date(activeDelivery.startTime);
        const endTime = new Date();
        const deliveryTimeMinutes = Math.round((endTime - startTime) / 60000);
        order.deliveryTimeMinutes = deliveryTimeMinutes;
        
        // Update delivery person stats
        const deliveryPerson = this.approvedDelivery.find(d => d.id === deliveryPersonId);
        if (deliveryPerson) {
            deliveryPerson.deliveries += 1;
            deliveryPerson.earnings += activeDelivery.deliveryFee || 150;
            deliveryPerson.lastDeliveryTime = new Date().toISOString();
        }
        
        // Move from active to completed deliveries
        const completedDelivery = {
            ...activeDelivery,
            completedAt: new Date().toISOString(),
            deliveryTimeMinutes: deliveryTimeMinutes,
            earnings: activeDelivery.deliveryFee || 150
        };
        
        this.completedDeliveries.push(completedDelivery);
        this.activeDeliveries.splice(activeDeliveryIndex, 1);
        
        // Clear delivery location
        delete this.deliveryLocations[deliveryPersonId];
        
        this.saveToStorage();
        
        return {
            order: order,
            deliveryPerson: deliveryPerson,
            completedDelivery: completedDelivery,
            earnings: activeDelivery.deliveryFee || 150,
            deliveryTime: deliveryTimeMinutes
        };
    }
    
    getCompletedDeliveriesForDeliveryPerson(deliveryPersonId) {
        return this.completedDeliveries.filter(d => d.deliveryPersonId === deliveryPersonId);
    }
    
    getCompletedOrdersForRestaurant(restaurantId) {
        return this.allOrders.filter(o => o.restaurantId === restaurantId && o.status === 'delivered');
    }
    
    getTotalPlatformStats() {
        const totalDeliveries = this.completedDeliveries.length;
        const totalPayouts = this.completedDeliveries.reduce((sum, d) => sum + (d.earnings || 0), 0);
        
        // Calculate average delivery time
        let avgTime = 25;
        if (this.completedDeliveries.length > 0) {
            const totalTime = this.completedDeliveries.reduce((sum, d) => sum + (d.deliveryTimeMinutes || 25), 0);
            avgTime = Math.round(totalTime / this.completedDeliveries.length);
        }
        
        return {
            totalDeliveries,
            totalPayouts,
            avgDeliveryTime: avgTime
        };
    }
}

// ============= APP MANAGER CLASS =============
class AppManager {
    constructor() {
        this.data = new DataManager();
        this.currentUser = null;
        this.currentRestaurantData = null;
        this.currentDeliveryData = null;
        this.customerActiveOrder = null;
        this.activeDelivery = null;
        this.chatMessages = [];
        this.unreadChatMessages = 0;
        this.map = null;
        this.deliveryMap = null;
        this.liveMap = null;
        this.markers = [];
        this.deliveryMarker = null;
        this.currentRadius = 1;
        this.orderItems = [];
        this.userLat = -1.2921;
        this.userLng = 36.8219;
        this.deliveryLat = -1.2921;
        this.deliveryLng = 36.8219;
        this.chatInterval = null;
        this.notificationInterval = null;
        this.locationInterval = null;
        this.logoClickCount = 0;
        this.logoClickTimer = null;
        
        this.bindElements();
        this.setupEventListeners();
        this.updateSwitchAuthLinks();
        this.setupLogoTripleClick();
        this.showUserType('customer');
    }
    
    bindElements() {
        // Auth elements
        this.authScreen = document.getElementById('authScreen');
        this.mainApp = document.getElementById('mainApp');
        this.customerView = document.getElementById('customerView');
        this.restaurantView = document.getElementById('restaurantView');
        this.deliveryView = document.getElementById('deliveryView');
        this.adminView = document.getElementById('adminView');
        
        this.loginTab = document.getElementById('loginTab');
        this.registerTab = document.getElementById('registerTab');
        this.loginForms = document.getElementById('loginForms');
        this.registerForms = document.getElementById('registerForms');
        this.selectCustomerBtn = document.getElementById('selectCustomerBtn');
        this.selectRestaurantBtn = document.getElementById('selectRestaurantBtn');
        this.selectDeliveryBtn = document.getElementById('selectDeliveryBtn');
        this.switchAuthLinks = document.getElementById('switchAuthLinks');
        
        // Login forms
        this.customerLoginForm = document.getElementById('customerLoginForm');
        this.restaurantLoginForm = document.getElementById('restaurantLoginForm');
        this.deliveryLoginForm = document.getElementById('deliveryLoginForm');
        this.customerLoginBtn = document.getElementById('customerLoginBtn');
        this.restaurantLoginBtn = document.getElementById('restaurantLoginBtn');
        this.deliveryLoginBtn = document.getElementById('deliveryLoginBtn');
        
        // Register forms
        this.customerRegisterForm = document.getElementById('customerRegisterForm');
        this.restaurantRegisterForm = document.getElementById('restaurantRegisterForm');
        this.deliveryRegisterForm = document.getElementById('deliveryRegisterForm');
        this.customerRegisterBtn = document.getElementById('customerRegisterBtn');
        this.restaurantRegisterBtn = document.getElementById('restaurantRegisterBtn');
        this.deliveryRegisterBtn = document.getElementById('deliveryRegisterBtn');
        
        // Main app elements
        this.userAvatar = document.getElementById('userAvatar');
        this.userName = document.getElementById('userName');
        this.userType = document.getElementById('userType');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.hotelList = document.getElementById('hotelList');
        this.currentLocation = document.getElementById('currentLocation');
        this.radiusButtons = document.querySelectorAll('.radius-btn');
        this.menuOverlay = document.getElementById('menuOverlay');
        this.closeMenuBtn = document.getElementById('closeMenuBtn');
        this.menuSection = document.getElementById('menuSection');
        this.menuHotelName = document.getElementById('menuHotelName');
        this.orderTotal = document.getElementById('orderTotal');
        this.clearOrderBtn = document.getElementById('clearOrderBtn');
        this.placeOrderBtn = document.getElementById('placeOrderBtn');
        
        // Customer order tracking
        this.orderTrackingBtn = document.getElementById('orderTrackingBtn');
        this.trackingPanel = document.getElementById('trackingPanel');
        this.closeTrackingBtn = document.getElementById('closeTrackingBtn');
        this.trackingContent = document.getElementById('trackingContent');
        
        // Live tracking
        this.liveTrackingContainer = document.getElementById('liveTrackingContainer');
        this.liveTrackingHeader = document.getElementById('liveTrackingHeader');
        this.closeLiveTrackingBtn = document.getElementById('closeLiveTrackingBtn');
        this.deliveryManName = document.getElementById('deliveryManName');
        this.deliveryManVehicle = document.getElementById('deliveryManVehicle');
        this.deliveryAvatar = document.getElementById('deliveryAvatar');
        this.liveETA = document.getElementById('liveETA');
        this.etaLabel = document.getElementById('etaLabel');
        this.liveMapMini = document.getElementById('liveMapMini');
        this.liveCallDeliveryBtn = document.getElementById('liveCallDeliveryBtn');
        this.liveChatDeliveryBtn = document.getElementById('liveChatDeliveryBtn');
        this.liveTrackingActions = document.getElementById('liveTrackingActions');
        this.deliveryCompletedMessage = document.getElementById('deliveryCompletedMessage');
        
        // Delivery completion modal
        this.deliveryCompletionModal = document.getElementById('deliveryCompletionModal');
        this.completedOrderId = document.getElementById('completedOrderId');
        this.completedEarnings = document.getElementById('completedEarnings');
        this.totalEarningsAfter = document.getElementById('totalEarningsAfter');
        this.closeCompletionModalBtn = document.getElementById('closeCompletionModalBtn');
        
        // Restaurant dashboard elements
        this.restaurantDashboardTitle = document.getElementById('restaurantDashboardTitle');
        this.restaurantDashboardSubtitle = document.getElementById('restaurantDashboardSubtitle');
        this.restaurantStatusToggle = document.getElementById('restaurantStatusToggle');
        this.saveRestaurantSettingsBtn = document.getElementById('saveRestaurantSettingsBtn');
        this.addMenuItemBtn = document.getElementById('addMenuItemBtn');
        this.menuManagementGrid = document.getElementById('menuManagementGrid');
        this.restaurantDeliveryStatusSection = document.getElementById('restaurantDeliveryStatusSection');
        this.restaurantActiveDeliveries = document.getElementById('restaurantActiveDeliveries');
        
        // Delivery dashboard elements
        this.deliveryDashboardSubtitle = document.getElementById('deliveryDashboardSubtitle');
        this.deliveryStatusBadge = document.getElementById('deliveryStatusBadge');
        this.deliveryStatusToggle = document.getElementById('deliveryStatusToggle');
        this.activeDeliveriesCount = document.getElementById('activeDeliveriesCount');
        this.deliveryRating = document.getElementById('deliveryRating');
        this.todayEarnings = document.getElementById('todayEarnings');
        this.completedDeliveries = document.getElementById('completedDeliveries');
        this.totalEarnedDisplay = document.getElementById('totalEarnedDisplay');
        this.currentDeliverySection = document.getElementById('currentDeliverySection');
        this.activeDeliveryOrderId = document.getElementById('activeDeliveryOrderId');
        this.activeDeliveryETA = document.getElementById('activeDeliveryETA');
        this.activeDeliveryPickup = document.getElementById('activeDeliveryPickup');
        this.activeDeliveryDropoff = document.getElementById('activeDeliveryDropoff');
        this.deliveryProgressFill = document.getElementById('deliveryProgressFill');
        this.callCustomerBtn = document.getElementById('callCustomerBtn');
        this.smsCustomerBtn = document.getElementById('smsCustomerBtn');
        this.chatCustomerBtn = document.getElementById('chatCustomerBtn');
        this.completeDeliveryBtn = document.getElementById('completeDeliveryBtn');
        this.availableDeliveriesList = document.getElementById('availableDeliveriesList');
        this.deliveryHistoryList = document.getElementById('deliveryHistoryList');
        
        // Admin verification elements
        this.restaurantVerificationTab = document.getElementById('restaurantVerificationTab');
        this.deliveryVerificationTab = document.getElementById('deliveryVerificationTab');
        this.restaurantVerificationSection = document.getElementById('restaurantVerificationSection');
        this.deliveryVerificationSection = document.getElementById('deliveryVerificationSection');
        this.restaurantVerificationList = document.getElementById('restaurantVerificationList');
        this.deliveryVerificationList = document.getElementById('deliveryVerificationList');
        this.pendingRestaurantCount = document.getElementById('pendingRestaurantCount');
        this.pendingDeliveryCount = document.getElementById('pendingDeliveryCount');
        
        // Admin stats
        this.completedOrdersCount = document.getElementById('completedOrdersCount');
        this.totalDeliveries = document.getElementById('totalDeliveries');
        this.avgDeliveryTime = document.getElementById('avgDeliveryTime');
        this.totalPayouts = document.getElementById('totalPayouts');
        
        // Chat system
        this.chatToggleBtn = document.getElementById('chatToggleBtn');
        this.chatContainer = document.getElementById('chatContainer');
        this.chatCloseBtn = document.getElementById('chatCloseBtn');
        this.chatMessagesEl = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.chatSendBtn = document.getElementById('chatSendBtn');
        this.callBtn = document.getElementById('callBtn');
        this.chatNotification = document.getElementById('chatNotification');
        
        // Notification system
        this.notificationContainer = document.getElementById('notificationContainer');
        
        // Logo
        this.mainLogo = document.getElementById('mainLogo');
    }
    
    setupEventListeners() {
        // Tab selection
        this.loginTab.addEventListener('click', () => this.showTab('login'));
        this.registerTab.addEventListener('click', () => this.showTab('register'));
        
        // User type selection
        this.selectCustomerBtn.addEventListener('click', () => this.showUserType('customer'));
        this.selectRestaurantBtn.addEventListener('click', () => this.showUserType('restaurant'));
        this.selectDeliveryBtn.addEventListener('click', () => this.showUserType('delivery'));
        
        // Login buttons
        this.customerLoginBtn.addEventListener('click', () => {
            const phone = document.getElementById('customerLoginPhone').value;
            this.loginAsCustomer(phone);
        });
        
        this.restaurantLoginBtn.addEventListener('click', () => {
            const email = document.getElementById('restaurantLoginEmail').value;
            const password = document.getElementById('restaurantLoginPassword').value;
            this.loginAsRestaurant(email, password);
        });
        
        this.deliveryLoginBtn.addEventListener('click', () => {
            const email = document.getElementById('deliveryLoginEmail').value;
            const password = document.getElementById('deliveryLoginPassword').value;
            this.loginAsDeliveryPerson(email, password);
        });
        
        // Register buttons
        this.customerRegisterBtn.addEventListener('click', () => this.registerAsCustomer());
        this.restaurantRegisterBtn.addEventListener('click', () => this.registerAsRestaurant());
        this.deliveryRegisterBtn.addEventListener('click', () => this.registerAsDeliveryPerson());
        
        // Logout button
        this.logoutBtn.addEventListener('click', () => this.logout());
        
        // Radius selection
        this.radiusButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.radiusButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentRadius = parseInt(btn.getAttribute('data-radius'));
                this.updateLocationText();
                this.renderHotelList();
                this.addRestaurantMarkers();
            });
        });
        
        // Close menu overlay
        this.closeMenuBtn.addEventListener('click', () => {
            this.menuOverlay.classList.add('hidden');
            document.querySelectorAll('.hotel-card').forEach(c => c.classList.remove('active'));
        });
        
        // Clear order
        this.clearOrderBtn.addEventListener('click', () => this.clearOrder());
        
        // Place order
        this.placeOrderBtn.addEventListener('click', () => this.placeOrder());
        
        // Order tracking
        this.orderTrackingBtn.addEventListener('click', () => {
            this.trackingPanel.classList.toggle('active');
            this.updateTrackingPanel();
        });
        
        this.closeTrackingBtn.addEventListener('click', () => {
            this.trackingPanel.classList.remove('active');
        });
        
        // Live tracking
        this.closeLiveTrackingBtn.addEventListener('click', () => {
            this.liveTrackingContainer.classList.remove('active');
        });
        
        this.liveCallDeliveryBtn.addEventListener('click', () => {
            if (this.customerActiveOrder && this.customerActiveOrder.deliveryPersonId) {
                this.callDeliveryPerson(this.customerActiveOrder.deliveryPersonId);
            }
        });
        
        this.liveChatDeliveryBtn.addEventListener('click', () => {
            if (this.customerActiveOrder && this.customerActiveOrder.deliveryPersonId) {
                this.openChatWithDeliveryPerson(this.customerActiveOrder.deliveryPersonId);
            }
        });
        
        // Restaurant dashboard
        this.restaurantStatusToggle.addEventListener('change', () => this.updateRestaurantStatus());
        this.saveRestaurantSettingsBtn.addEventListener('click', () => this.saveRestaurantSettings());
        this.addMenuItemBtn.addEventListener('click', () => this.showAddMenuItemModal());
        
        // Delivery dashboard - COMPLETE DELIVERY BUTTON
        this.deliveryStatusToggle.addEventListener('change', () => this.updateDeliveryStatus());
        this.callCustomerBtn.addEventListener('click', () => this.callCustomer());
        this.smsCustomerBtn.addEventListener('click', () => this.smsCustomer());
        this.chatCustomerBtn.addEventListener('click', () => this.chatWithCustomer());
        this.completeDeliveryBtn.addEventListener('click', () => this.completeDelivery());
        
        // Close completion modal
        this.closeCompletionModalBtn.addEventListener('click', () => {
            this.deliveryCompletionModal.classList.remove('active');
        });
        
        // Admin verification tabs
        this.restaurantVerificationTab.addEventListener('click', () => {
            this.restaurantVerificationTab.classList.add('active');
            this.deliveryVerificationTab.classList.remove('active');
            this.restaurantVerificationSection.style.display = 'block';
            this.deliveryVerificationSection.style.display = 'none';
        });
        
        this.deliveryVerificationTab.addEventListener('click', () => {
            this.deliveryVerificationTab.classList.add('active');
            this.restaurantVerificationTab.classList.remove('active');
            this.deliveryVerificationSection.style.display = 'block';
            this.restaurantVerificationSection.style.display = 'none';
            this.renderDeliveryVerificationList();
        });
        
        // Chat system
        this.chatToggleBtn.addEventListener('click', () => this.toggleChat());
        this.chatCloseBtn.addEventListener('click', () => {
            this.chatContainer.classList.remove('active');
        });
        
        this.chatSendBtn.addEventListener('click', () => this.sendChatMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        
        this.callBtn.addEventListener('click', () => {
            this.showNotification('Voice call feature would be integrated here', 'info');
        });
        
        // Main logo click (admin access)
        this.mainLogo.addEventListener('click', () => {
            this.logoClickCount++;
            
            if (this.logoClickCount === 1) {
                this.logoClickTimer = setTimeout(() => {
                    this.logoClickCount = 0;
                }, 500);
            } else if (this.logoClickCount === 3) {
                clearTimeout(this.logoClickTimer);
                this.loginAsAdmin();
                this.logoClickCount = 0;
            }
        });
    }
    
    setupLogoTripleClick() {
        const logo = document.getElementById('logo');
        logo.addEventListener('click', () => {
            this.logoClickCount++;
            
            if (this.logoClickCount === 1) {
                this.logoClickTimer = setTimeout(() => {
                    this.logoClickCount = 0;
                }, 500);
            } else if (this.logoClickCount === 3) {
                clearTimeout(this.logoClickTimer);
                this.loginAsAdmin();
                this.logoClickCount = 0;
            }
        });
    }
    
    // ============= AUTH FUNCTIONS =============
    showTab(tab) {
        if (tab === 'login') {
            this.loginTab.classList.add('active');
            this.registerTab.classList.remove('active');
            this.loginForms.classList.add('active');
            this.registerForms.classList.remove('active');
        } else {
            this.registerTab.classList.add('active');
            this.loginTab.classList.remove('active');
            this.registerForms.classList.add('active');
            this.loginForms.classList.remove('active');
        }
        this.updateSwitchAuthLinks();
    }
    
    showUserType(type) {
        this.selectCustomerBtn.classList.remove('active');
        this.selectRestaurantBtn.classList.remove('active');
        this.selectDeliveryBtn.classList.remove('active');
        
        this.customerLoginForm.style.display = 'none';
        this.restaurantLoginForm.style.display = 'none';
        this.deliveryLoginForm.style.display = 'none';
        this.customerRegisterForm.style.display = 'none';
        this.restaurantRegisterForm.style.display = 'none';
        this.deliveryRegisterForm.style.display = 'none';
        
        if (type === 'customer') {
            this.selectCustomerBtn.classList.add('active');
            this.customerLoginForm.style.display = 'block';
            this.customerRegisterForm.style.display = 'block';
        } else if (type === 'restaurant') {
            this.selectRestaurantBtn.classList.add('active');
            this.restaurantLoginForm.style.display = 'block';
            this.restaurantRegisterForm.style.display = 'block';
        } else if (type === 'delivery') {
            this.selectDeliveryBtn.classList.add('active');
            this.deliveryLoginForm.style.display = 'block';
            this.deliveryRegisterForm.style.display = 'block';
        }
        
        this.updateSwitchAuthLinks();
    }
    
    updateSwitchAuthLinks() {
        const isLogin = this.loginTab.classList.contains('active');
        const isCustomer = this.selectCustomerBtn.classList.contains('active');
        const isRestaurant = this.selectRestaurantBtn.classList.contains('active');
        const isDelivery = this.selectDeliveryBtn.classList.contains('active');
        
        if (isLogin) {
            if (isCustomer) {
                this.switchAuthLinks.innerHTML = 'Don\'t have an account? <a id="switchLink">Register as Customer</a>';
            } else if (isRestaurant) {
                this.switchAuthLinks.innerHTML = 'Don\'t have an account? <a id="switchLink">Register your Restaurant</a>';
            } else if (isDelivery) {
                this.switchAuthLinks.innerHTML = 'Don\'t have an account? <a id="switchLink">Register as Delivery Person</a>';
            }
        } else {
            if (isCustomer) {
                this.switchAuthLinks.innerHTML = 'Already have an account? <a id="switchLink">Login as Customer</a>';
            } else if (isRestaurant) {
                this.switchAuthLinks.innerHTML = 'Already have an account? <a id="switchLink">Login as Restaurant</a>';
            } else if (isDelivery) {
                this.switchAuthLinks.innerHTML = 'Already have an account? <a id="switchLink">Login as Delivery Person</a>';
            }
        }
        
        const switchLink = document.getElementById('switchLink');
        if (switchLink) {
            switchLink.addEventListener('click', () => {
                if (this.loginTab.classList.contains('active')) {
                    this.showTab('register');
                } else {
                    this.showTab('login');
                }
            });
        }
    }
    
    // ============= CUSTOMER AUTH =============
    loginAsCustomer(phone) {
        if (!phone) {
            this.showNotification('Please enter your phone number', 'warning');
            return;
        }
        
        let user = this.data.findCustomerByPhone(phone);
        
        if (!user) {
            user = this.data.addCustomer({
                phone: phone,
                name: `Customer ${this.data.users.customers.length + 1}`,
                location: 'Nairobi, Kenya'
            });
            this.showNotification('New customer account created!', 'success');
        }
        
        this.currentUser = user;
        this.customerActiveOrder = this.data.getActiveCustomerOrder(user.id);
        this.showMainApp();
        this.initCustomerApp();
    }
    
    registerAsCustomer() {
        const name = document.getElementById('customerRegisterName').value;
        const phone = document.getElementById('customerRegisterPhone').value;
        const email = document.getElementById('customerRegisterEmail').value;
        const location = document.getElementById('customerRegisterLocation').value;
        
        if (!name || !phone || !location) {
            this.showNotification('Please fill all required fields', 'warning');
            return;
        }
        
        if (this.data.findCustomerByPhone(phone)) {
            this.showNotification('Phone number already registered. Please login instead.', 'warning');
            return;
        }
        
        const newCustomer = this.data.addCustomer({
            name: name,
            phone: phone,
            email: email || '',
            location: location
        });
        
        this.currentUser = newCustomer;
        
        document.getElementById('customerRegisterName').value = '';
        document.getElementById('customerRegisterPhone').value = '';
        document.getElementById('customerRegisterEmail').value = '';
        document.getElementById('customerRegisterLocation').value = '';
        
        this.showMainApp();
        this.initCustomerApp();
        this.showNotification('Customer account created successfully!', 'success');
    }
    
    // ============= RESTAURANT AUTH =============
    loginAsRestaurant(email, password) {
        if (!email || !password) {
            this.showNotification('Please fill all fields', 'warning');
            return;
        }
        
        let restaurant = this.data.findRestaurantByEmail(email);
        
        if (!restaurant) {
            this.showNotification('Restaurant not found or not approved yet', 'warning');
            return;
        }
        
        if (restaurant.password !== password) {
            this.showNotification('Invalid password', 'warning');
            return;
        }
        
        this.currentUser = {
            id: restaurant.id,
            name: restaurant.name,
            email: restaurant.email,
            type: 'restaurant',
            avatarText: restaurant.name.charAt(0).toUpperCase()
        };
        
        this.currentRestaurantData = restaurant;
        this.showMainApp();
        this.initRestaurantDashboard();
        this.startChatMonitoring();
    }
    
    registerAsRestaurant() {
        const name = document.getElementById('restaurantRegisterName').value;
        const owner = document.getElementById('restaurantRegisterOwner').value;
        const email = document.getElementById('restaurantRegisterEmail').value;
        const phone = document.getElementById('restaurantRegisterPhone').value;
        const location = document.getElementById('restaurantRegisterLocation').value;
        const password = document.getElementById('restaurantRegisterPassword').value;
        const confirmPassword = document.getElementById('restaurantRegisterConfirmPassword').value;
        
        if (!name || !owner || !email || !phone || !location || !password || !confirmPassword) {
            this.showNotification('Please fill all required fields', 'warning');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showNotification('Passwords do not match', 'warning');
            return;
        }
        
        const existing = this.data.approvedRestaurants.find(r => r.email === email) || 
                       this.data.pendingRestaurants.find(r => r.email === email);
        
        if (existing) {
            this.showNotification('Email already registered', 'warning');
            return;
        }
        
        const newRestaurant = this.data.addPendingRestaurant({
            name: name,
            owner: owner,
            email: email,
            phone: phone,
            location: location,
            password: password
        });
        
        document.getElementById('restaurantRegisterName').value = '';
        document.getElementById('restaurantRegisterOwner').value = '';
        document.getElementById('restaurantRegisterEmail').value = '';
        document.getElementById('restaurantRegisterPhone').value = '';
        document.getElementById('restaurantRegisterLocation').value = '';
        document.getElementById('restaurantRegisterPassword').value = '';
        document.getElementById('restaurantRegisterConfirmPassword').value = '';
        
        this.showNotification('Restaurant registration submitted! Our admin will review and approve your application soon.', 'success');
        this.showTab('login');
        this.showUserType('restaurant');
    }
    
    // ============= DELIVERY PERSON AUTH =============
    loginAsDeliveryPerson(email, password) {
        if (!email || !password) {
            this.showNotification('Please fill all fields', 'warning');
            return;
        }
        
        let delivery = this.data.findDeliveryPersonByEmail(email);
        
        if (!delivery) {
            this.showNotification('Delivery person not found or not approved yet', 'warning');
            return;
        }
        
        if (delivery.password !== password) {
            this.showNotification('Invalid password', 'warning');
            return;
        }
        
        this.currentUser = {
            id: delivery.id,
            name: delivery.name,
            email: delivery.email,
            type: 'delivery',
            avatarText: delivery.name.charAt(0).toUpperCase()
        };
        
        this.currentDeliveryData = delivery;
        this.activeDelivery = this.data.getActiveDeliveryForDeliveryPerson(delivery.id);
        this.showMainApp();
        this.initDeliveryDashboard();
        this.startLocationTracking();
    }
    
    registerAsDeliveryPerson() {
        const name = document.getElementById('deliveryRegisterName').value;
        const phone = document.getElementById('deliveryRegisterPhone').value;
        const email = document.getElementById('deliveryRegisterEmail').value;
        const vehicle = document.getElementById('deliveryRegisterVehicle').value;
        const plate = document.getElementById('deliveryRegisterPlate').value;
        const location = document.getElementById('deliveryRegisterLocation').value;
        const password = document.getElementById('deliveryRegisterPassword').value;
        const confirmPassword = document.getElementById('deliveryRegisterConfirmPassword').value;
        const idNumber = document.getElementById('deliveryRegisterId').value;
        
        if (!name || !phone || !email || !vehicle || !location || !password || !confirmPassword || !idNumber) {
            this.showNotification('Please fill all required fields', 'warning');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showNotification('Passwords do not match', 'warning');
            return;
        }
        
        const existing = this.data.approvedDelivery.find(d => d.email === email) || 
                       this.data.pendingDelivery.find(d => d.email === email);
        
        if (existing) {
            this.showNotification('Email already registered', 'warning');
            return;
        }
        
        const newDelivery = this.data.addDeliveryPerson({
            name: name,
            phone: phone,
            email: email,
            vehicle: vehicle,
            plate: plate || '',
            location: location,
            password: password,
            idNumber: idNumber
        });
        
        document.getElementById('deliveryRegisterName').value = '';
        document.getElementById('deliveryRegisterPhone').value = '';
        document.getElementById('deliveryRegisterEmail').value = '';
        document.getElementById('deliveryRegisterVehicle').value = 'motorcycle';
        document.getElementById('deliveryRegisterPlate').value = '';
        document.getElementById('deliveryRegisterLocation').value = '';
        document.getElementById('deliveryRegisterPassword').value = '';
        document.getElementById('deliveryRegisterConfirmPassword').value = '';
        document.getElementById('deliveryRegisterId').value = '';
        
        this.showNotification('Delivery registration submitted! Our admin will review and approve your application soon.', 'success');
        this.showTab('login');
        this.showUserType('delivery');
    }
    
    // ============= ADMIN AUTH =============
    loginAsAdmin() {
        this.currentUser = {
            id: 1,
            name: 'Platform Admin',
            email: 'admin@letseat.com',
            type: 'admin',
            avatarText: 'A'
        };
        
        this.showMainApp();
        this.initAdminDashboard();
        this.showNotification('Admin panel accessed via secret code', 'info');
    }
    
    // ============= MAIN APP =============
    showMainApp() {
        this.authScreen.style.display = 'none';
        this.mainApp.style.display = 'block';
        
        this.userAvatar.textContent = this.currentUser.avatarText || this.currentUser.name.charAt(0).toUpperCase();
        this.userName.textContent = this.currentUser.name;
        this.userType.textContent = this.currentUser.type.charAt(0).toUpperCase() + this.currentUser.type.slice(1);
        
        if (this.currentUser.type === 'customer') {
            this.orderTrackingBtn.style.display = this.customerActiveOrder ? 'flex' : 'none';
        } else {
            this.orderTrackingBtn.style.display = 'none';
        }
        
        this.customerView.style.display = 'none';
        this.restaurantView.classList.remove('active');
        this.deliveryView.classList.remove('active');
        this.adminView.classList.remove('active');
        
        if (this.currentUser.type === 'customer') {
            this.customerView.style.display = 'flex';
        } else if (this.currentUser.type === 'restaurant') {
            this.restaurantView.classList.add('active');
        } else if (this.currentUser.type === 'delivery') {
            this.deliveryView.classList.add('active');
        } else if (this.currentUser.type === 'admin') {
            this.adminView.classList.add('active');
        }
    }
    
    logout() {
        this.currentUser = null;
        this.currentRestaurantData = null;
        this.currentDeliveryData = null;
        this.orderItems = [];
        this.customerActiveOrder = null;
        this.activeDelivery = null;
        
        if (this.locationInterval) {
            clearInterval(this.locationInterval);
            this.locationInterval = null;
        }
        
        if (this.chatInterval) {
            clearInterval(this.chatInterval);
            this.chatInterval = null;
        }
        
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
            this.notificationInterval = null;
        }
        
        document.getElementById('customerLoginPhone').value = '';
        document.getElementById('restaurantLoginEmail').value = '';
        document.getElementById('restaurantLoginPassword').value = '';
        document.getElementById('deliveryLoginEmail').value = '';
        document.getElementById('deliveryLoginPassword').value = '';
        
        this.showUserType('customer');
        this.showTab('login');
        
        this.authScreen.style.display = 'flex';
        this.mainApp.style.display = 'none';
        
        this.menuOverlay.classList.add('hidden');
        this.chatContainer.classList.remove('active');
        this.trackingPanel.classList.remove('active');
        this.liveTrackingContainer.classList.remove('active');
        
        this.unreadChatMessages = 0;
        this.updateChatNotification();
    }
    
    // ============= CUSTOMER APP =============
    initCustomerApp() {
        this.initMap();
        this.renderHotelList();
        this.updateLocationText();
        this.startNotificationMonitoring();
        
        if (this.customerActiveOrder && this.customerActiveOrder.deliveryPersonId) {
            this.showLiveTracking();
        }
    }
    
    initMap() {
        if (this.map) {
            this.map.remove();
        }
        
        this.map = L.map('map').setView([this.userLat, this.userLng], 14);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        
        L.marker([this.userLat, this.userLng], {
            icon: L.divIcon({
                html: '<i class="fas fa-user" style="color: #004E89; font-size: 24px;"></i>',
                iconSize: [24, 24],
                className: 'user-location-marker'
            })
        }).addTo(this.map).bindPopup('Your Location').openPopup();
        
        this.addRestaurantMarkers();
    }
    
    addRestaurantMarkers() {
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];
        
        this.data.approvedRestaurants.forEach(restaurant => {
            const distance = this.getDistanceFromUser(restaurant.lat, restaurant.lng);
            
            if (distance <= this.currentRadius && restaurant.isOpen) {
                const marker = L.marker([restaurant.lat, restaurant.lng], {
                    icon: L.divIcon({
                        html: `<i class="fas fa-utensils" style="color: #28A745; font-size: 20px;"></i>`,
                        iconSize: [20, 20],
                        className: 'restaurant-marker'
                    })
                }).addTo(this.map);
                
                marker.bindPopup(`
                    <strong>${restaurant.name}</strong><br>
                    🟢 Open<br>
                    Distance: ${distance.toFixed(1)} km<br>
                    ${restaurant.deliveryAvailable ? '🚚 Delivery Available' : '📦 Pickup Only'}
                `);
                
                marker.on('click', () => {
                    this.showRestaurantMenu(restaurant);
                });
                
                this.markers.push(marker);
            }
        });
    }
    
    getDistanceFromUser(lat, lng) {
        const latDiff = Math.abs(this.userLat - lat) * 111;
        const lngDiff = Math.abs(this.userLng - lng) * 111 * Math.cos((this.userLat + lat) * Math.PI / 360);
        return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    }
    
    renderHotelList() {
        this.hotelList.innerHTML = '';
        
        this.data.approvedRestaurants.forEach(restaurant => {
            const distance = this.getDistanceFromUser(restaurant.lat, restaurant.lng);
            
            if (distance <= this.currentRadius) {
                const card = document.createElement('div');
                card.className = `hotel-card`;
                card.innerHTML = `
                    <div class="hotel-header">
                        <div class="hotel-name">${restaurant.name}</div>
                        <div class="hotel-status ${restaurant.isOpen ? 'status-open' : 'status-closed'}">
                            ${restaurant.isOpen ? 'OPEN' : 'CLOSED'}
                        </div>
                    </div>
                    <div class="hotel-details">
                        <div><i class="fas fa-walking"></i> ${distance.toFixed(1)} km</div>
                        <div><i class="far fa-clock"></i> ${restaurant.openTime} - ${restaurant.closeTime}</div>
                    </div>
                    <div class="hotel-footer">
                        <div class="delivery-badge">
                            ${restaurant.deliveryAvailable ? `<i class="fas fa-motorcycle"></i> Delivery: KSh ${restaurant.deliveryFee}` : '<i class="fas fa-store"></i> Pickup Only'}
                        </div>
                        <div class="price-range">${restaurant.priceRange}</div>
                    </div>
                `;
                
                card.addEventListener('click', () => {
                    if (!restaurant.isOpen) {
                        this.showNotification(`${restaurant.name} is currently closed`, 'warning');
                        return;
                    }
                    this.showRestaurantMenu(restaurant);
                    document.querySelectorAll('.hotel-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                });
                
                this.hotelList.appendChild(card);
            }
        });
    }
    
    showRestaurantMenu(restaurant) {
        this.currentRestaurant = restaurant;
        this.menuHotelName.textContent = restaurant.name;
        
        const categories = {};
        restaurant.menu.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
        });
        
        this.menuSection.innerHTML = '';
        
        Object.keys(categories).forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'menu-category';
            categoryDiv.innerHTML = `<h4 class="category-title">${category}</h4>`;
            
            categories[category].forEach(item => {
                if (!item.available) return;
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'menu-item';
                itemDiv.innerHTML = `
                    <div class="item-info">
                        <div class="item-name">${item.name}</div>
                        <div class="item-price"><span class="currency">${item.price}</span></div>
                    </div>
                    <div class="item-actions">
                        <div class="quantity-control">
                            <button class="qty-btn minus" data-id="${item.id}">-</button>
                            <span class="quantity" data-id="${item.id}">0</span>
                            <button class="qty-btn plus" data-id="${item.id}">+</button>
                        </div>
                    </div>
                `;
                
                categoryDiv.appendChild(itemDiv);
            });
            
            if (categoryDiv.children.length > 0) {
                this.menuSection.appendChild(categoryDiv);
            }
        });
        
        this.menuOverlay.classList.remove('hidden');
        
        document.querySelectorAll('.qty-btn.plus').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = parseInt(btn.getAttribute('data-id'));
                this.addToOrder(itemId);
            });
        });
        
        document.querySelectorAll('.qty-btn.minus').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = parseInt(btn.getAttribute('data-id'));
                this.removeFromOrder(itemId);
            });
        });
        
        this.updateOrderSummary();
    }
    
    addToOrder(itemId) {
        const restaurant = this.currentRestaurant;
        const item = restaurant.menu.find(i => i.id === itemId);
        
        if (!item) return;
        
        const existingItem = this.orderItems.find(i => i.id === itemId);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.orderItems.push({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: 1
            });
        }
        
        const quantityElement = document.querySelector(`.quantity[data-id="${itemId}"]`);
        if (quantityElement) {
            const itemInOrder = this.orderItems.find(i => i.id === itemId);
            quantityElement.textContent = itemInOrder ? itemInOrder.quantity : 0;
        }
        
        this.updateOrderSummary();
    }
    
    removeFromOrder(itemId) {
        const existingItemIndex = this.orderItems.findIndex(i => i.id === itemId);
        
        if (existingItemIndex !== -1) {
            if (this.orderItems[existingItemIndex].quantity > 1) {
                this.orderItems[existingItemIndex].quantity -= 1;
            } else {
                this.orderItems.splice(existingItemIndex, 1);
            }
        }
        
        const quantityElement = document.querySelector(`.quantity[data-id="${itemId}"]`);
        if (quantityElement) {
            const itemInOrder = this.orderItems.find(i => i.id === itemId);
            quantityElement.textContent = itemInOrder ? itemInOrder.quantity : 0;
        }
        
        this.updateOrderSummary();
    }
    
    clearOrder() {
        this.orderItems = [];
        this.updateOrderSummary();
        document.querySelectorAll('.quantity').forEach(el => {
            el.textContent = '0';
        });
        this.showNotification('Order cleared', 'info');
    }
    
    updateOrderSummary() {
        if (this.orderItems.length === 0) {
            document.getElementById('orderItems').innerHTML = '<p class="empty-order">No items added yet</p>';
            this.orderTotal.textContent = '0';
            this.placeOrderBtn.disabled = true;
            return;
        }
        
        let subtotal = 0;
        let itemsHTML = '';
        
        this.orderItems.forEach(item => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            
            itemsHTML += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>${item.name} x${item.quantity}</span>
                    <span><span class="currency">${itemTotal}</span></span>
                </div>
            `;
        });
        
        let total = subtotal;
        if (this.currentRestaurant && this.currentRestaurant.deliveryAvailable) {
            total += this.currentRestaurant.deliveryFee;
            itemsHTML += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; border-top: 1px solid #eee; padding-top: 5px;">
                    <span>Delivery Fee</span>
                    <span><span class="currency">${this.currentRestaurant.deliveryFee}</span></span>
                </div>
            `;
        }
        
        document.getElementById('orderItems').innerHTML = itemsHTML;
        this.orderTotal.textContent = total.toLocaleString();
        this.placeOrderBtn.disabled = false;
    }
    
    placeOrder() {
        if (this.orderItems.length === 0) {
            this.showNotification('Please add items to your order first.', 'warning');
            return;
        }
        
        if (!this.currentRestaurant) {
            this.showNotification('Please select a restaurant first.', 'warning');
            return;
        }
        
        const subtotal = this.orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = this.currentRestaurant.deliveryAvailable ? this.currentRestaurant.deliveryFee : 0;
        const total = subtotal + deliveryFee;
        
        const newOrder = {
            restaurantId: this.currentRestaurant.id,
            restaurantName: this.currentRestaurant.name,
            restaurantLat: this.currentRestaurant.lat,
            restaurantLng: this.currentRestaurant.lng,
            customerId: this.currentUser.id,
            customerName: this.currentUser.name,
            customerPhone: this.currentUser.phone,
            customerLocation: this.currentUser.location,
            customerLat: this.userLat,
            customerLng: this.userLng,
            items: this.orderItems.map(item => ({ 
                name: item.name, 
                price: item.price, 
                quantity: item.quantity 
            })),
            total: total,
            status: 'preparing',
            deliveryStatus: 'pending',
            tracking: [
                { step: "Order Received", time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), completed: true },
                { step: "Preparing", time: "", completed: false },
                { step: "Ready for Dispatch", time: "", completed: false },
                { step: "Dispatched", time: "", completed: false },
                { step: "Delivered", time: "", completed: false }
            ]
        };
        
        const order = this.data.addOrder(newOrder);
        this.customerActiveOrder = order;
        
        this.orderTrackingBtn.style.display = 'flex';
        
        this.showNotification(`Order placed successfully at ${this.currentRestaurant.name}! Order ID: #${order.id}`, 'success');
        
        this.clearOrder();
        this.menuOverlay.classList.add('hidden');
    }
    
    updateLocationText() {
        this.currentLocation.textContent = `Nairobi, Kenya (${this.currentRadius} km radius)`;
    }
    
    updateTrackingPanel() {
        if (!this.customerActiveOrder) {
            this.trackingContent.innerHTML = '<p style="color: var(--gray); text-align: center; padding: 20px;">No active orders to track</p>';
            return;
        }
        
        let stepsHTML = '';
        this.customerActiveOrder.tracking.forEach((step, index) => {
            let stepClass = '';
            if (step.completed) {
                stepClass = index === 4 ? 'completed' : 'active';
            }
            
            stepsHTML += `
                <div class="tracking-step ${stepClass}">
                    <div class="step-icon">${index + 1}</div>
                    <div class="step-info">
                        <h4>${step.step}</h4>
                        <p>${step.time || 'Pending'}</p>
                    </div>
                </div>
            `;
        });
        
        let deliveryInfo = '';
        if (this.customerActiveOrder.deliveryPersonId) {
            const deliveryPerson = this.data.findDeliveryPersonById(this.customerActiveOrder.deliveryPersonId);
            if (deliveryPerson) {
                deliveryInfo = `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                        <h4 style="color: var(--delivery); margin-bottom: 10px;">
                            <i class="fas fa-motorcycle"></i> Delivery Person
                        </h4>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="user-avatar" style="background: var(--delivery);">${deliveryPerson.name.charAt(0)}</div>
                            <div>
                                <strong>${deliveryPerson.name}</strong>
                                <p style="color: var(--gray); font-size: 0.9rem;">${deliveryPerson.vehicle} • ${deliveryPerson.plate || 'No plate'}</p>
                            </div>
                        </div>
                        <button class="btn btn-outline" style="margin-top: 10px; width: 100%;" id="viewLiveTrackingBtn">
                            <i class="fas fa-location-dot"></i> View Live Tracking
                        </button>
                    </div>
                `;
            }
        }
        
        // If order is delivered, show completion message
        let completionMessage = '';
        if (this.customerActiveOrder.status === 'delivered') {
            completionMessage = `
                <div style="margin-top: 20px; padding: 15px; background: rgba(40, 167, 69, 0.1); border-radius: 8px; text-align: center;">
                    <i class="fas fa-check-circle" style="color: var(--success); font-size: 2rem; margin-bottom: 10px;"></i>
                    <h4 style="color: var(--success);">Order Delivered!</h4>
                    <p style="color: var(--gray);">Delivered at: ${this.customerActiveOrder.tracking[4].time || 'N/A'}</p>
                    <p style="margin-top: 10px;">Enjoy your meal! 🍽️</p>
                </div>
            `;
        }
        
        this.trackingContent.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h4 style="color: var(--primary); margin-bottom: 5px;">Order #${this.customerActiveOrder.id}</h4>
                <p style="color: var(--gray); font-size: 0.9rem;">${this.customerActiveOrder.restaurantName}</p>
                <p style="color: var(--dark); font-weight: 600; margin-top: 10px;">Total: <span class="currency">${this.customerActiveOrder.total}</span></p>
            </div>
            <div class="tracking-steps">
                ${stepsHTML}
            </div>
            ${deliveryInfo}
            ${completionMessage}
        `;
        
        const viewLiveBtn = document.getElementById('viewLiveTrackingBtn');
        if (viewLiveBtn) {
            viewLiveBtn.addEventListener('click', () => {
                this.showLiveTracking();
            });
        }
    }
    
    // ============= RESTAURANT DASHBOARD =============
    initRestaurantDashboard() {
        if (!this.currentRestaurantData) return;
        
        this.restaurantDashboardTitle.textContent = this.currentRestaurantData.name;
        this.restaurantDashboardSubtitle.textContent = `Manage ${this.currentRestaurantData.name} - ${this.currentRestaurantData.location}`;
        
        this.updateMenuManagementGrid();
        this.updateOrdersList();
        this.updateRestaurantStats();
        this.updateRestaurantDeliveries();
        
        document.getElementById('openingTime').value = '08:00';
        document.getElementById('closingTime').value = '22:00';
        document.getElementById('deliveryFee').value = this.currentRestaurantData.deliveryFee || 50;
        this.restaurantStatusToggle.checked = this.currentRestaurantData.isOpen !== false;
    }
    
    updateRestaurantStatus() {
        const isOpen = this.restaurantStatusToggle.checked;
        if (this.currentRestaurantData) {
            this.currentRestaurantData.isOpen = isOpen;
            this.data.saveToStorage();
            this.showNotification(`Restaurant is now ${isOpen ? 'OPEN' : 'CLOSED'}`, 'info');
        }
    }
    
    saveRestaurantSettings() {
        const openingTime = document.getElementById('openingTime').value;
        const closingTime = document.getElementById('closingTime').value;
        const deliveryFee = parseInt(document.getElementById('deliveryFee').value);
        
        if (this.currentRestaurantData) {
            this.currentRestaurantData.openTime = this.formatTime(openingTime);
            this.currentRestaurantData.closeTime = this.formatTime(closingTime);
            this.currentRestaurantData.deliveryFee = deliveryFee;
            this.data.saveToStorage();
            this.showNotification('Restaurant settings saved successfully!', 'success');
        }
    }
    
    updateMenuManagementGrid() {
        this.menuManagementGrid.innerHTML = '';
        
        if (!this.currentRestaurantData.menu || this.currentRestaurantData.menu.length === 0) {
            this.menuManagementGrid.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--gray); grid-column: 1 / -1;">
                    <i class="fas fa-utensils" style="font-size: 3rem; margin-bottom: 15px;"></i>
                    <h3>No menu items yet</h3>
                    <p>Add your first menu item to get started</p>
                </div>
            `;
            return;
        }
        
        this.currentRestaurantData.menu.forEach(item => {
            const menuItemCard = document.createElement('div');
            menuItemCard.className = 'menu-item-card';
            menuItemCard.innerHTML = `
                <div class="menu-item-header">
                    <div class="menu-item-name">${item.name}</div>
                    <div class="menu-item-price"><span class="currency">${item.price}</span></div>
                </div>
                <div class="menu-item-category">${item.category}</div>
                <div class="menu-item-description">${item.description || 'No description'}</div>
                <div class="availability-toggle">
                    <div class="availability-label">
                        <i class="fas fa-${item.available ? 'check-circle' : 'times-circle'}"></i>
                        ${item.available ? 'Available' : 'Not Available'}
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${item.available ? 'checked' : ''} data-id="${item.id}">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `;
            
            this.menuManagementGrid.appendChild(menuItemCard);
        });
        
        document.querySelectorAll('.availability-toggle input').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const itemId = parseInt(toggle.getAttribute('data-id'));
                this.toggleMenuItemAvailability(itemId, toggle.checked);
            });
        });
        
        document.getElementById('menuItemsCount').textContent = this.currentRestaurantData.menu.length;
        document.getElementById('availableItems').textContent = this.currentRestaurantData.menu.filter(item => item.available).length;
    }
    
    toggleMenuItemAvailability(itemId, isAvailable) {
        const item = this.currentRestaurantData.menu.find(i => i.id === itemId);
        if (item) {
            item.available = isAvailable;
            this.data.saveToStorage();
            this.showNotification(`${item.name} is now ${isAvailable ? 'available' : 'not available'}`, 'info');
            this.updateMenuManagementGrid();
        }
    }
    
    showAddMenuItemModal() {
        const name = prompt('Enter menu item name:');
        if (!name) return;
        
        const category = prompt('Enter category (Breakfast, Lunch, Dinner, Drinks, etc.):', 'Main');
        if (!category) return;
        
        const price = prompt('Enter price (KSh):', '500');
        if (!price || isNaN(price)) {
            this.showNotification('Please enter a valid price', 'warning');
            return;
        }
        
        const description = prompt('Enter description (optional):', '');
        
        const newItem = {
            id: this.currentRestaurantData.menu.length + 1,
            name: name,
            category: category,
            price: parseInt(price),
            available: true,
            description: description || ''
        };
        
        if (!this.currentRestaurantData.menu) {
            this.currentRestaurantData.menu = [];
        }
        
        this.currentRestaurantData.menu.push(newItem);
        this.data.saveToStorage();
        this.updateMenuManagementGrid();
        this.updateRestaurantStats();
        
        this.showNotification('Menu item added successfully!', 'success');
    }
    
    updateOrdersList() {
        const ordersList = document.getElementById('ordersList');
        if (!this.currentRestaurantData) return;
        
        const restaurantOrders = this.data.getRestaurantOrders(this.currentRestaurantData.id);
        
        if (restaurantOrders.length === 0) {
            ordersList.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--gray);">No orders yet</p>';
            return;
        }
        
        ordersList.innerHTML = '';
        
        restaurantOrders.forEach(order => {
            const orderCard = document.createElement('div');
            orderCard.className = `order-card ${order.status === 'delivered' ? 'delivered' : ''}`;
            
            let itemsHTML = '';
            order.items.forEach(item => {
                itemsHTML += `
                    <div class="order-item">
                        <span>${item.name} x${item.quantity}</span>
                        <span><span class="currency">${item.price * item.quantity}</span></span>
                    </div>
                `;
            });
            
            let actionBtn = '';
            if (order.status === 'preparing') {
                actionBtn = `<button class="dispatch-btn" data-order="${order.id}" style="background: var(--success);">
                    <i class="fas fa-check"></i> Mark as Ready
                </button>`;
            } else if (order.status === 'ready') {
                actionBtn = `<span class="delivery-completion-badge">
                    <i class="fas fa-clock"></i> Awaiting Delivery
                </span>`;
            } else if (order.status === 'dispatched') {
                actionBtn = `<span class="delivery-completion-badge">
                    <i class="fas fa-truck"></i> Out for Delivery
                </span>`;
            } else if (order.status === 'delivered') {
                actionBtn = `<span class="delivery-completion-badge">
                    <i class="fas fa-check-circle"></i> Delivered
                </span>`;
            }
            
            orderCard.innerHTML = `
                <div class="order-header">
                    <div class="order-id ${order.status === 'delivered' ? 'delivered' : ''}">Order #${order.id}</div>
                    <div class="order-time">${new Date(order.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
                <div class="order-items">
                    ${itemsHTML}
                    <div class="order-item">
                        <span><strong>Customer:</strong></span>
                        <span>${order.customerName}</span>
                    </div>
                    <div class="order-item">
                        <span><strong>Delivery to:</strong></span>
                        <span>${order.customerLocation || 'N/A'}</span>
                    </div>
                </div>
                <div class="order-footer">
                    <div class="order-total">Total: <span class="currency">${order.total}</span></div>
                    <div class="order-status status-${order.status}">
                        ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </div>
                </div>
                ${actionBtn}
            `;
            ordersList.appendChild(orderCard);
        });
        
        document.querySelectorAll('.dispatch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = parseInt(btn.getAttribute('data-order'));
                this.markOrderAsReady(orderId);
            });
        });
    }
    
    markOrderAsReady(orderId) {
        const order = this.data.allOrders.find(o => o.id === orderId);
        if (order) {
            order.status = 'ready';
            order.tracking[1].completed = true;
            order.tracking[1].time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            order.tracking[2] = { step: "Ready for Dispatch", time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), completed: true };
            this.data.saveToStorage();
            this.showNotification(`Order #${orderId} is ready for delivery!`, 'success');
            this.updateOrdersList();
            this.updateRestaurantStats();
        }
    }
    
    // NEW: Update restaurant view of active deliveries
    updateRestaurantDeliveries() {
        if (!this.currentRestaurantData) return;
        
        const activeDeliveries = this.data.activeDeliveries.filter(d => 
            d.restaurantName === this.currentRestaurantData.name
        );
        
        if (activeDeliveries.length === 0) {
            this.restaurantDeliveryStatusSection.style.display = 'none';
            return;
        }
        
        this.restaurantDeliveryStatusSection.style.display = 'block';
        this.restaurantActiveDeliveries.innerHTML = '';
        
        activeDeliveries.forEach(delivery => {
            const deliveryPerson = this.data.findDeliveryPersonById(delivery.deliveryPersonId);
            const div = document.createElement('div');
            div.className = 'order-card';
            div.innerHTML = `
                <div class="order-header">
                    <div class="order-id">Order #${delivery.orderId}</div>
                    <span class="delivery-status-badge status-busy">On Delivery</span>
                </div>
                <div style="margin: 10px 0;">
                    <strong>Delivery Person:</strong> ${deliveryPerson?.name || 'Unknown'}<br>
                    <strong>Vehicle:</strong> ${deliveryPerson?.vehicle || 'N/A'} • ${deliveryPerson?.plate || 'No plate'}<br>
                    <strong>Customer:</strong> ${delivery.customerName}<br>
                    <strong>ETA:</strong> ${delivery.eta} min
                </div>
                <div class="delivery-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${delivery.eta ? 100 - (delivery.eta * 3.33) : 50}%; background: var(--success);"></div>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--gray); margin-top: 5px;">
                        <i class="fas fa-clock"></i> Dispatched at: ${new Date(delivery.startTime).toLocaleTimeString()}
                    </p>
                </div>
            `;
            this.restaurantActiveDeliveries.appendChild(div);
        });
    }
    
    updateRestaurantStats() {
        if (!this.currentRestaurantData) return;
        
        const restaurantOrders = this.data.getRestaurantOrders(this.currentRestaurantData.id);
        const today = new Date().toISOString().split('T')[0];
        const todayOrders = restaurantOrders.filter(o => o.date.split('T')[0] === today);
        const completedToday = todayOrders.filter(o => o.status === 'delivered');
        
        document.getElementById('todayOrders').textContent = todayOrders.length;
        document.getElementById('todayRevenue').textContent = completedToday.reduce((sum, o) => sum + o.total, 0).toLocaleString();
        
        const uniqueCustomers = new Set(todayOrders.map(o => o.customerName));
        document.getElementById('todayCustomers').textContent = uniqueCustomers.size;
        
        const avgOrder = completedToday.length > 0 ? 
            completedToday.reduce((sum, o) => sum + o.total, 0) / completedToday.length : 0;
        document.getElementById('avgOrderValue').textContent = Math.round(avgOrder).toLocaleString();
        
        const activeOrders = restaurantOrders.filter(o => o.status !== 'delivered').length;
        document.getElementById('activeOrders').textContent = activeOrders;
    }
    
    // ============= DELIVERY DASHBOARD =============
    initDeliveryDashboard() {
        if (!this.currentDeliveryData) return;
        
        this.deliveryDashboardSubtitle.textContent = `Welcome back, ${this.currentDeliveryData.name}!`;
        this.deliveryStatusToggle.checked = this.currentDeliveryData.status === 'online';
        this.updateDeliveryStatusUI();
        this.deliveryRating.textContent = this.currentDeliveryData.rating || 4.8;
        this.todayEarnings.textContent = this.currentDeliveryData.earnings || 0;
        this.completedDeliveries.textContent = this.currentDeliveryData.deliveries || 0;
        this.totalEarnedDisplay.textContent = this.currentDeliveryData.earnings || 0;
        
        this.loadAvailableDeliveries();
        this.loadDeliveryHistory();
        
        if (this.activeDelivery) {
            this.showActiveDelivery(this.activeDelivery);
        } else {
            this.currentDeliverySection.style.display = 'none';
            this.activeDeliveriesCount.textContent = '0';
        }
        
        this.initDeliveryMap();
    }
    
    updateDeliveryStatus() {
        const isOnline = this.deliveryStatusToggle.checked;
        if (this.currentDeliveryData) {
            this.currentDeliveryData.status = isOnline ? 'online' : 'offline';
            this.data.saveToStorage();
            this.updateDeliveryStatusUI();
            this.showNotification(`You are now ${isOnline ? 'ONLINE' : 'OFFLINE'}`, 'info');
        }
    }
    
    updateDeliveryStatusUI() {
        const isOnline = this.deliveryStatusToggle.checked;
        const badge = this.deliveryStatusBadge;
        
        if (isOnline) {
            badge.className = 'delivery-status-badge status-online';
            badge.innerHTML = '<i class="fas fa-check-circle"></i> Online';
        } else {
            badge.className = 'delivery-status-badge status-offline';
            badge.innerHTML = '<i class="fas fa-circle"></i> Offline';
        }
    }
    
    initDeliveryMap() {
        if (this.deliveryMap) {
            this.deliveryMap.remove();
        }
        
        this.deliveryMap = L.map('deliveryMap').setView([this.userLat, this.userLng], 14);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.deliveryMap);
    }
    
    showActiveDelivery(delivery) {
        this.currentDeliverySection.style.display = 'block';
        this.activeDeliveryOrderId.textContent = `Order #${delivery.orderId}`;
        this.activeDeliveryETA.textContent = `${delivery.eta} min`;
        this.activeDeliveryPickup.textContent = delivery.restaurantName;
        this.activeDeliveryDropoff.textContent = delivery.customerLocation;
        this.deliveryProgressFill.style.width = '50%';
        
        this.updateDeliveryMapWithRoute(delivery);
        
        this.activeDeliveriesCount.textContent = '1';
    }
    
    updateDeliveryMapWithRoute(delivery) {
        if (!this.deliveryMap) {
            this.initDeliveryMap();
        }
        
        this.deliveryMap.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                this.deliveryMap.removeLayer(layer);
            }
        });
        
        L.marker([delivery.restaurantLat, delivery.restaurantLng], {
            icon: L.divIcon({
                html: '<i class="fas fa-store" style="color: var(--secondary); font-size: 24px;"></i>',
                iconSize: [24, 24],
                className: 'pickup-marker'
            })
        }).addTo(this.deliveryMap).bindPopup('Pickup: ' + delivery.restaurantName);
        
        L.marker([delivery.customerLat, delivery.customerLng], {
            icon: L.divIcon({
                html: '<i class="fas fa-flag-checkered" style="color: var(--success); font-size: 24px;"></i>',
                iconSize: [24, 24],
                className: 'dropoff-marker'
            })
        }).addTo(this.deliveryMap).bindPopup('Dropoff: ' + delivery.customerLocation);
        
        this.deliveryMarker = L.marker([delivery.restaurantLat, delivery.restaurantLng], {
            icon: L.divIcon({
                html: `
                    <div class="delivery-marker">
                        <i class="fas fa-motorcycle"></i>
                        <div class="delivery-pulse"></div>
                    </div>
                `,
                iconSize: [24, 24],
                className: 'delivery-marker'
            })
        }).addTo(this.deliveryMap).bindPopup('Your Location');
        
        const bounds = L.latLngBounds(
            [delivery.restaurantLat, delivery.restaurantLng],
            [delivery.customerLat, delivery.customerLng]
        );
        this.deliveryMap.fitBounds(bounds, { padding: [50, 50] });
    }
    
    startLocationTracking() {
        if (this.locationInterval) {
            clearInterval(this.locationInterval);
        }
        
        this.locationInterval = setInterval(() => {
            if (this.currentDeliveryData && this.activeDelivery) {
                this.deliveryLat = this.deliveryLat || this.activeDelivery.restaurantLat;
                this.deliveryLng = this.deliveryLng || this.activeDelivery.restaurantLng;
                
                // Move towards customer
                this.deliveryLat += (this.activeDelivery.customerLat - this.deliveryLat) * 0.05;
                this.deliveryLng += (this.activeDelivery.customerLng - this.deliveryLng) * 0.05;
                
                this.data.updateDeliveryLocation(this.currentDeliveryData.id, this.deliveryLat, this.deliveryLng);
                
                if (this.deliveryMarker) {
                    this.deliveryMarker.setLatLng([this.deliveryLat, this.deliveryLng]);
                }
                
                const distance = this.calculateDistance(
                    this.deliveryLat, this.deliveryLng,
                    this.activeDelivery.customerLat, this.activeDelivery.customerLng
                );
                const totalDistance = this.calculateDistance(
                    this.activeDelivery.restaurantLat, this.activeDelivery.restaurantLng,
                    this.activeDelivery.customerLat, this.activeDelivery.customerLng
                );
                const progressPercent = ((totalDistance - distance) / totalDistance) * 100;
                if (this.deliveryProgressFill) {
                    this.deliveryProgressFill.style.width = `${progressPercent}%`;
                }
                
                const eta = Math.max(5, Math.round(distance * 20));
                this.activeDeliveryETA.textContent = `${eta} min`;
                this.activeDelivery.eta = eta;
                
                if (this.customerActiveOrder && this.customerActiveOrder.id === this.activeDelivery.orderId) {
                    this.updateLiveTrackingMap();
                }
                
                // Update restaurant view
                if (this.currentUser.type === 'restaurant') {
                    this.updateRestaurantDeliveries();
                }
            }
        }, 3000);
    }
    
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    loadAvailableDeliveries() {
        const availableOrders = this.data.getOrdersReadyForDelivery();
        
        this.availableDeliveriesList.innerHTML = '';
        this.availableDeliveriesCount.textContent = `${availableOrders.length} orders waiting`;
        
        if (availableOrders.length === 0) {
            this.availableDeliveriesList.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--gray);">No available deliveries at the moment</p>';
            return;
        }
        
        availableOrders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'delivery-order-card';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span class="order-id">Order #${order.id}</span>
                    <span class="order-status status-ready">Ready</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>${order.restaurantName}</strong>
                </div>
                <div class="order-address">
                    <i class="fas fa-map-pin"></i> Pickup: ${order.restaurantName}<br>
                    <i class="fas fa-flag-checkered"></i> Dropoff: ${order.customerLocation}
                </div>
                <div style="margin-bottom: 10px; color: var(--gray);">
                    <i class="fas fa-box"></i> ${order.items.length} items
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span>Total:</span>
                    <span class="currency">${order.total}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; background: #f8f9fa; padding: 10px; border-radius: 8px;">
                    <span>Delivery Fee:</span>
                    <span class="currency" style="color: var(--success); font-weight: 700;">150</span>
                </div>
                <button class="accept-delivery-btn" data-order="${order.id}">
                    <i class="fas fa-check"></i> Accept Delivery (Earn KSh 150)
                </button>
            `;
            
            this.availableDeliveriesList.appendChild(card);
        });
        
        document.querySelectorAll('.accept-delivery-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = parseInt(btn.getAttribute('data-order'));
                this.acceptDelivery(orderId);
            });
        });
    }
    
    acceptDelivery(orderId) {
        if (!this.currentDeliveryData) return;
        
        if (this.activeDelivery) {
            this.showNotification('You already have an active delivery. Complete it first.', 'warning');
            return;
        }
        
        if (this.currentDeliveryData.status !== 'online') {
            this.showNotification('Please go online to accept deliveries', 'warning');
            return;
        }
        
        const activeDelivery = this.data.assignDeliveryToOrder(orderId, this.currentDeliveryData.id);
        if (activeDelivery) {
            this.activeDelivery = activeDelivery;
            this.showActiveDelivery(activeDelivery);
            this.loadAvailableDeliveries();
            this.showNotification('Delivery accepted! Head to the restaurant for pickup.', 'success');
            
            // Update restaurant view
            this.updateRestaurantDeliveries();
        }
    }
    
    // ============= COMPLETE DELIVERY - DELIVERY GUY CLICKS THIS =============
    completeDelivery() {
        if (!this.activeDelivery) {
            this.showNotification('No active delivery to complete', 'warning');
            return;
        }
        
        // Double confirmation
        if (!confirm('Have you delivered the food to the customer? Click OK to confirm delivery is complete.')) {
            return;
        }
        
        // Show loading state
        this.completeDeliveryBtn.disabled = true;
        this.completeDeliveryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        // Process the completion
        const result = this.data.completeDelivery(this.activeDelivery.orderId, this.currentDeliveryData.id);
        
        if (result) {
            // Update delivery person stats
            this.currentDeliveryData = result.deliveryPerson;
            
            // Show success modal with earnings
            this.completedOrderId.textContent = this.activeDelivery.orderId;
            this.completedEarnings.textContent = result.earnings;
            this.totalEarningsAfter.textContent = this.currentDeliveryData.earnings || 0;
            this.deliveryCompletionModal.classList.add('active');
            
            // Update UI
            this.activeDelivery = null;
            this.currentDeliverySection.style.display = 'none';
            this.activeDeliveriesCount.textContent = '0';
            this.todayEarnings.textContent = this.currentDeliveryData.earnings || 0;
            this.completedDeliveries.textContent = this.currentDeliveryData.deliveries || 0;
            this.totalEarnedDisplay.textContent = this.currentDeliveryData.earnings || 0;
            
            // Reload lists
            this.loadAvailableDeliveries();
            this.loadDeliveryHistory();
            
            // Notify all parties
            this.showNotification(`✅ Delivery #${result.order.id} completed! Earned KSh ${result.earnings}`, 'success');
            
            // Update customer's live tracking if they're viewing
            if (this.customerActiveOrder && this.customerActiveOrder.id === result.order.id) {
                this.customerActiveOrder = result.order;
                this.showDeliveryCompletedToCustomer();
            }
            
            // Update restaurant dashboard
            if (this.currentUser.type === 'restaurant') {
                this.updateRestaurantDeliveries();
                this.updateOrdersList();
            }
            
            // Update admin stats
            if (this.currentUser.type === 'admin') {
                this.updateAdminStats();
            }
            
            // Clear delivery location
            this.deliveryLat = null;
            this.deliveryLng = null;
        }
        
        // Reset button
        this.completeDeliveryBtn.disabled = false;
        this.completeDeliveryBtn.innerHTML = '<i class="fas fa-check-circle"></i> CONFIRM DELIVERY COMPLETE';
    }
    
    // Show delivery completed to customer
    showDeliveryCompletedToCustomer() {
        // Update tracking panel
        this.updateTrackingPanel();
        
        // Update live tracking UI
        this.liveTrackingHeader.classList.add('completed');
        this.liveTrackingHeader.innerHTML = '<h3><i class="fas fa-check-circle"></i> Delivery Completed</h3>';
        this.deliveryAvatar.classList.add('completed');
        this.liveETA.classList.add('completed');
        this.liveETA.textContent = 'Delivered!';
        this.etaLabel.textContent = 'Your food has been delivered';
        this.liveTrackingActions.style.display = 'none';
        this.deliveryCompletedMessage.style.display = 'block';
        
        // Hide order tracking button
        this.orderTrackingBtn.style.display = 'none';
        
        // Clear active order
        this.customerActiveOrder = null;
    }
    
    loadDeliveryHistory() {
        const completedDeliveries = this.data.getCompletedDeliveriesForDeliveryPerson(this.currentDeliveryData.id);
        
        this.deliveryHistoryList.innerHTML = '';
        
        if (completedDeliveries.length === 0) {
            this.deliveryHistoryList.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--gray);">No completed deliveries yet</p>';
            return;
        }
        
        completedDeliveries.slice(-5).reverse().forEach(delivery => {
            const card = document.createElement('div');
            card.className = 'delivery-order-card completed';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span class="order-id" style="color: var(--success);">Order #${delivery.orderId}</span>
                    <span class="order-status status-delivered">Delivered</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>${delivery.restaurantName}</strong>
                </div>
                <div class="order-address">
                    <i class="fas fa-user"></i> ${delivery.customerName}<br>
                    <i class="fas fa-map-marker-alt"></i> ${delivery.customerLocation}
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                    <span>Delivery Time:</span>
                    <span>${delivery.deliveryTimeMinutes || 25} min</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 5px; color: var(--success); font-weight: 700;">
                    <span>Earned:</span>
                    <span class="currency">${delivery.earnings || 150}</span>
                </div>
                <p style="font-size: 0.7rem; color: var(--gray); margin-top: 10px;">
                    Completed: ${new Date(delivery.completedAt).toLocaleString()}
                </p>
            `;
            
            this.deliveryHistoryList.appendChild(card);
        });
    }
    
    callCustomer() {
        if (this.activeDelivery) {
            const order = this.data.allOrders.find(o => o.id === this.activeDelivery.orderId);
            if (order && order.customerPhone) {
                window.location.href = `tel:${order.customerPhone}`;
                this.showNotification(`Calling ${order.customerName}...`, 'info');
            } else {
                this.showNotification('Customer phone number not available', 'warning');
            }
        }
    }
    
    smsCustomer() {
        if (this.activeDelivery) {
            const order = this.data.allOrders.find(o => o.id === this.activeDelivery.orderId);
            if (order && order.customerPhone) {
                window.location.href = `sms:${order.customerPhone}`;
                this.showNotification(`Opening SMS to ${order.customerName}...`, 'info');
            } else {
                this.showNotification('Customer phone number not available', 'warning');
            }
        }
    }
    
    chatWithCustomer() {
        if (this.activeDelivery) {
            this.toggleChat();
            this.sendSystemMessage(`Connected with customer for order #${this.activeDelivery.orderId}`);
        }
    }
    
    callDeliveryPerson(deliveryPersonId) {
        const deliveryPerson = this.data.findDeliveryPersonById(deliveryPersonId);
        if (deliveryPerson && deliveryPerson.phone) {
            window.location.href = `tel:${deliveryPerson.phone}`;
            this.showNotification(`Calling ${deliveryPerson.name}...`, 'info');
        }
    }
    
    openChatWithDeliveryPerson(deliveryPersonId) {
        this.toggleChat();
        this.sendSystemMessage(`Connected with delivery person for order #${this.customerActiveOrder.id}`);
    }
    
    showLiveTracking() {
        if (!this.customerActiveOrder || !this.customerActiveOrder.deliveryPersonId) return;
        
        const deliveryPerson = this.data.findDeliveryPersonById(this.customerActiveOrder.deliveryPersonId);
        if (!deliveryPerson) return;
        
        this.deliveryManName.textContent = deliveryPerson.name;
        this.deliveryManVehicle.textContent = `${deliveryPerson.vehicle} • ${deliveryPerson.plate || 'No plate'}`;
        this.deliveryAvatar.textContent = deliveryPerson.name.charAt(0).toUpperCase();
        
        const activeDelivery = this.data.getActiveDeliveryForCustomer(this.customerActiveOrder.id);
        if (activeDelivery) {
            this.liveETA.textContent = `${activeDelivery.eta || 15} min`;
        }
        
        // Reset UI if it was previously completed
        this.liveTrackingHeader.classList.remove('completed');
        this.liveTrackingHeader.innerHTML = '<h3><i class="fas fa-motorcycle"></i> Live Delivery Tracking</h3>';
        this.deliveryAvatar.classList.remove('completed');
        this.liveETA.classList.remove('completed');
        this.etaLabel.textContent = 'Estimated arrival time';
        this.liveTrackingActions.style.display = 'flex';
        this.deliveryCompletedMessage.style.display = 'none';
        
        this.liveTrackingContainer.classList.add('active');
        this.initLiveMap();
    }
    
    initLiveMap() {
        if (this.liveMap) {
            this.liveMap.remove();
        }
        
        this.liveMap = L.map('liveMapMini').setView([this.userLat, this.userLng], 14);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.liveMap);
        
        this.updateLiveTrackingMap();
    }
    
    updateLiveTrackingMap() {
        if (!this.liveMap) return;
        
        this.liveMap.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                this.liveMap.removeLayer(layer);
            }
        });
        
        const deliveryLocation = this.data.getDeliveryLocation(this.customerActiveOrder.deliveryPersonId);
        if (deliveryLocation) {
            L.marker([deliveryLocation.lat, deliveryLocation.lng], {
                icon: L.divIcon({
                    html: `
                        <div class="delivery-marker">
                            <i class="fas fa-motorcycle" style="color: var(--delivery); font-size: 24px;"></i>
                            <div class="delivery-pulse"></div>
                        </div>
                    `,
                    iconSize: [24, 24],
                    className: 'delivery-marker'
                })
            }).addTo(this.liveMap).bindPopup('Delivery Person');
            
            L.marker([this.userLat, this.userLng], {
                icon: L.divIcon({
                    html: '<i class="fas fa-user" style="color: #004E89; font-size: 24px;"></i>',
                    iconSize: [24, 24],
                    className: 'user-location-marker'
                })
            }).addTo(this.liveMap).bindPopup('Your Location');
            
            const bounds = L.latLngBounds(
                [deliveryLocation.lat, deliveryLocation.lng],
                [this.userLat, this.userLng]
            );
            this.liveMap.fitBounds(bounds, { padding: [50, 50] });
        }
    }
    
    // ============= ADMIN DASHBOARD =============
    initAdminDashboard() {
        this.updateAdminStats();
        this.renderRestaurantVerificationList();
        this.renderDeliveryVerificationList();
    }
    
    updateAdminStats() {
        const stats = this.data.getTotalPlatformStats();
        
        document.getElementById('totalCustomers').textContent = this.data.users.customers.length;
        document.getElementById('activeRestaurants').textContent = this.data.approvedRestaurants.length;
        document.getElementById('activeDeliveryPersonnel').textContent = this.data.approvedDelivery.length;
        document.getElementById('pendingDeliveryApprovals').textContent = this.data.pendingDelivery.length;
        document.getElementById('totalOrders').textContent = this.data.allOrders.length;
        document.getElementById('completedOrdersCount').textContent = this.data.completedDeliveries.length;
        
        this.pendingRestaurantCount.textContent = `${this.data.pendingRestaurants.length} restaurants pending approval`;
        this.pendingDeliveryCount.textContent = `${this.data.pendingDelivery.length} delivery personnel pending approval`;
        
        // Delivery stats
        this.totalDeliveries.textContent = stats.totalDeliveries;
        this.avgDeliveryTime.textContent = `${stats.avgDeliveryTime} min`;
        this.totalPayouts.textContent = stats.totalPayouts.toLocaleString();
    }
    
    renderRestaurantVerificationList() {
        this.restaurantVerificationList.innerHTML = '';
        
        if (this.data.pendingRestaurants.length === 0) {
            this.restaurantVerificationList.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--gray);">No pending restaurant approvals</p>';
            return;
        }
        
        this.data.pendingRestaurants.forEach(restaurant => {
            const verificationCard = document.createElement('div');
            verificationCard.className = 'verification-card';
            verificationCard.innerHTML = `
                <div class="verification-header">
                    <div class="verification-avatar">${restaurant.name.charAt(0).toUpperCase()}</div>
                    <div class="verification-info">
                        <h4>${restaurant.name}</h4>
                        <p><i class="fas fa-user"></i> Owner: ${restaurant.owner}</p>
                        <p><i class="fas fa-envelope"></i> ${restaurant.email}</p>
                        <p><i class="fas fa-phone"></i> ${restaurant.phone}</p>
                        <p><i class="fas fa-map-marker-alt"></i> ${restaurant.location}</p>
                        <p><i class="far fa-calendar"></i> Applied: ${restaurant.dateApplied}</p>
                    </div>
                </div>
                
                <div class="verification-actions">
                    <button class="btn-approve" data-id="${restaurant.id}" data-type="restaurant">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn-reject" data-id="${restaurant.id}" data-type="restaurant">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            `;
            
            this.restaurantVerificationList.appendChild(verificationCard);
        });
        
        document.querySelectorAll('.btn-approve[data-type="restaurant"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                this.approveRestaurant(id);
            });
        });
        
        document.querySelectorAll('.btn-reject[data-type="restaurant"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                this.rejectRestaurant(id);
            });
        });
    }
    
    renderDeliveryVerificationList() {
        this.deliveryVerificationList.innerHTML = '';
        
        if (this.data.pendingDelivery.length === 0) {
            this.deliveryVerificationList.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--gray);">No pending delivery personnel approvals</p>';
            return;
        }
        
        this.data.pendingDelivery.forEach(delivery => {
            const verificationCard = document.createElement('div');
            verificationCard.className = 'verification-card';
            verificationCard.innerHTML = `
                <div class="verification-header">
                    <div class="verification-avatar">${delivery.name.charAt(0).toUpperCase()}</div>
                    <div class="verification-info">
                        <h4>${delivery.name}</h4>
                        <p><i class="fas fa-envelope"></i> ${delivery.email}</p>
                        <p><i class="fas fa-phone"></i> ${delivery.phone}</p>
                        <p><i class="fas fa-motorcycle"></i> Vehicle: ${delivery.vehicle}</p>
                        <p><i class="fas fa-id-card"></i> Plate: ${delivery.plate || 'N/A'}</p>
                        <p><i class="fas fa-id-card"></i> ID: ${delivery.idNumber}</p>
                        <p><i class="far fa-calendar"></i> Applied: ${delivery.dateApplied}</p>
                    </div>
                </div>
                
                <div class="verification-actions">
                    <button class="btn-approve" data-id="${delivery.id}" data-type="delivery">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn-reject" data-id="${delivery.id}" data-type="delivery">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            `;
            
            this.deliveryVerificationList.appendChild(verificationCard);
        });
        
        document.querySelectorAll('.btn-approve[data-type="delivery"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                this.approveDeliveryPerson(id);
            });
        });
        
        document.querySelectorAll('.btn-reject[data-type="delivery"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                this.rejectDeliveryPerson(id);
            });
        });
    }
    
    approveRestaurant(id) {
        if (confirm('Approve this restaurant? This will add them to the platform.')) {
            const approved = this.data.approveRestaurant(id);
            if (approved) {
                this.renderRestaurantVerificationList();
                this.updateAdminStats();
                this.showNotification(`${approved.name} has been approved and added to the platform!`, 'success');
            }
        }
    }
    
    rejectRestaurant(id) {
        const reason = prompt('Enter reason for rejecting this restaurant:', 'Incomplete documentation');
        if (reason !== null) {
            const rejected = this.data.rejectRestaurant(id);
            if (rejected) {
                this.renderRestaurantVerificationList();
                this.updateAdminStats();
                this.showNotification(`Restaurant has been rejected. Reason: ${reason}`, 'warning');
            }
        }
    }
    
    approveDeliveryPerson(id) {
        if (confirm('Approve this delivery person? This will add them to the platform.')) {
            const approved = this.data.approveDeliveryPerson(id);
            if (approved) {
                this.renderDeliveryVerificationList();
                this.updateAdminStats();
                this.showNotification(`${approved.name} has been approved and added to the platform!`, 'success');
            }
        }
    }
    
    rejectDeliveryPerson(id) {
        const reason = prompt('Enter reason for rejecting this delivery person:', 'Incomplete documentation');
        if (reason !== null) {
            const rejected = this.data.rejectDeliveryPerson(id);
            if (rejected) {
                this.renderDeliveryVerificationList();
                this.updateAdminStats();
                this.showNotification(`Delivery person has been rejected. Reason: ${reason}`, 'warning');
            }
        }
    }
    
    // ============= CHAT FUNCTIONS =============
    toggleChat() {
        this.chatContainer.classList.toggle('active');
        
        if (this.chatContainer.classList.contains('active')) {
            this.loadChatMessages();
            this.unreadChatMessages = 0;
            this.updateChatNotification();
        }
    }
    
    loadChatMessages() {
        this.chatMessagesEl.innerHTML = '';
        
        if (this.chatMessages.length === 0) {
            this.chatMessagesEl.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--gray);">
                    <i class="fas fa-comments" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>Start a conversation</p>
                </div>
            `;
            return;
        }
        
        this.chatMessages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.sender === this.currentUser?.type ? 'sent' : 'received'}`;
            messageDiv.innerHTML = `
                ${msg.text}
                <div class="message-time">${msg.time}</div>
            `;
            this.chatMessagesEl.appendChild(messageDiv);
        });
        
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
    }
    
    sendChatMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;
        
        const newMessage = {
            sender: this.currentUser?.type || 'customer',
            text: message,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
        
        this.chatMessages.push(newMessage);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message sent';
        messageDiv.innerHTML = `
            ${message}
            <div class="message-time">${newMessage.time}</div>
        `;
        this.chatMessagesEl.appendChild(messageDiv);
        
        this.chatInput.value = '';
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
        
        setTimeout(() => {
            this.receiveChatMessage();
        }, 1000);
    }
    
    receiveChatMessage() {
        const responses = [
            "Thanks for the update!",
            "On my way!",
            "ETA about 10 minutes",
            "I'll be there soon",
            "Please wait at the pickup point",
            "Just arrived!",
            "Thank you for the order!"
        ];
        const response = responses[Math.floor(Math.random() * responses.length)];
        
        const replyMessage = {
            sender: this.currentUser?.type === 'delivery' ? 'customer' : 'delivery',
            text: response,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
        
        this.chatMessages.push(replyMessage);
        
        if (this.chatContainer.classList.contains('active')) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'message received';
            replyDiv.innerHTML = `
                ${response}
                <div class="message-time">${replyMessage.time}</div>
            `;
            this.chatMessagesEl.appendChild(replyDiv);
            this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
        } else {
            this.unreadChatMessages++;
            this.updateChatNotification();
        }
    }
    
    sendSystemMessage(message) {
        const systemMessage = {
            sender: 'system',
            text: message,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
        
        this.chatMessages.push(systemMessage);
        
        if (this.chatContainer.classList.contains('active')) {
            const systemDiv = document.createElement('div');
            systemDiv.style.cssText = 'text-align: center; color: var(--gray); font-size: 0.8rem; padding: 10px;';
            systemDiv.textContent = `${message} • ${systemMessage.time}`;
            this.chatMessagesEl.appendChild(systemDiv);
            this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
        }
    }
    
    updateChatNotification() {
        if (this.unreadChatMessages > 0) {
            this.chatNotification.textContent = this.unreadChatMessages;
            this.chatNotification.style.display = 'flex';
        } else {
            this.chatNotification.style.display = 'none';
        }
    }
    
    startChatMonitoring() {
        if (this.chatInterval) clearInterval(this.chatInterval);
        
        this.chatInterval = setInterval(() => {
            if (this.currentUser && (this.currentUser.type === 'restaurant' || this.currentUser.type === 'delivery') && Math.random() < 0.1) {
                this.receiveChatMessage();
            }
        }, 30000);
    }
    
    startNotificationMonitoring() {
        if (this.notificationInterval) clearInterval(this.notificationInterval);
        
        this.notificationInterval = setInterval(() => {
            if (this.currentUser && this.currentUser.type === 'customer' && this.customerActiveOrder) {
                this.checkOrderStatus();
            }
            if (this.currentUser && this.currentUser.type === 'restaurant') {
                this.updateRestaurantDeliveries();
                this.updateOrdersList();
                this.updateRestaurantStats();
            }
        }, 10000);
    }
    
    checkOrderStatus() {
        if (!this.customerActiveOrder) return;
        
        const order = this.data.allOrders.find(o => o.id === this.customerActiveOrder.id);
        if (!order) return;
        
        if (order.status !== this.customerActiveOrder.status) {
            this.customerActiveOrder = order;
            
            if (order.status === 'delivered') {
                this.showDeliveryCompletedToCustomer();
                this.showNotification(`✅ Your order #${order.id} has been delivered! Enjoy your meal!`, 'success');
            } else {
                this.showNotification(`Order #${order.id} status updated to: ${order.status}`, 'info');
            }
            
            this.updateTrackingPanel();
            
            if (order.deliveryPersonId && order.status === 'dispatched') {
                this.showLiveTracking();
            }
        }
    }
    
    formatTime(time24) {
        if (!time24) return "8:00 AM";
        
        const [hours, minutes] = time24.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        
        return `${hour12}:${minutes} ${ampm}`;
    }
    
    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        this.notificationContainer.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppManager();
});