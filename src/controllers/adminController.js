// ============ CRITICAL FALLBACKS for admin-dashboard ============
if (typeof window.loadAllTeachers !== 'function') {
    console.warn('loadAllTeachers not defined – using fallback');
    window.loadAllTeachers = async function() {
        try {
            const response = await api.admin.getTeachers();
            return response.data || [];
        } catch (error) {
            console.error('Fallback loadAllTeachers error:', error);
            return [];
        }
    };
}

if (typeof window.renderStudentsTable !== 'function') {
    console.warn('renderStudentsTable not defined – using fallback');
    window.renderStudentsTable = function(students) {
        if (!students || students.length === 0) {
            return '<div class="text-center py-8 text-muted-foreground">No students found</div>';
        }
        return `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-muted/50">
                        <tr>
                            <th class="px-4 py-3 text-left">Student</th>
                            <th class="px-4 py-3 text-left">ELIMUID</th>
                            <th class="px-4 py-3 text-left">Grade</th>
                            <th class="px-4 py-3 text-left">Status</th>
                            <th class="px-4 py-3 text-left">Parent Email</th>
                            <th class="px-4 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${students.map(student => {
                            const user = student.User || {};
                            const name = user.name || 'Unknown';
                            const email = user.email || 'N/A';
                            const status = student.status || 'active';
                            const statusClass = status === 'active' ? 'bg-green-100 text-green-700' : 
                                               status === 'inactive' ? 'bg-red-100 text-red-700' : 
                                               'bg-gray-100 text-gray-700';
                            const initials = getInitials(name);
                            return `
                                <tr class="hover:bg-accent/50">
                                    <td class="px-4 py-3">
                                        <div class="flex items-center gap-3">
                                            <div class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                                <span class="font-medium text-blue-700 text-sm">${initials}</span>
                                            </div>
                                            <span class="font-medium">${escapeHtml(name)}</span>
                                        </div>
                                    </td>
                                    <td class="px-4 py-3"><span class="font-mono text-xs bg-muted px-2 py-1 rounded">${student.elimuid || 'N/A'}</span></td>
                                    <td class="px-4 py-3">${student.grade || 'N/A'}</td>
                                    <td class="px-4 py-3"><span class="px-2 py-1 ${statusClass} text-xs rounded-full">${status}</span></td>
                                    <td class="px-4 py-3">${email}</td>
                                    <td class="px-4 py-3 text-center">
                                        <button onclick="adminViewStudentDetails('${student.id}')" class="p-1 hover:bg-accent rounded" title="View"><i data-lucide="eye" class="h-4 w-4"></i></button>
                                        <button onclick="adminEditStudent('${student.id}')" class="p-1 hover:bg-accent rounded" title="Edit"><i data-lucide="edit" class="h-4 w-4"></i></button>
                                        ${status === 'active' ? 
                                            `<button onclick="adminSuspendStudent('${student.id}', '${escapeHtml(name)}')" class="p-1 hover:bg-yellow-100 rounded" title="Suspend"><i data-lucide="pause-circle" class="h-4 w-4 text-yellow-600"></i></button>` : 
                                            `<button onclick="adminReactivateStudent('${student.id}', '${escapeHtml(name)}')" class="p-1 hover:bg-green-100 rounded" title="Reactivate"><i data-lucide="play-circle" class="h-4 w-4 text-green-600"></i></button>`
                                        }
                                        <button onclick="adminDeleteStudent('${student.id}', '${escapeHtml(name)}')" class="p-1 hover:bg-red-100 rounded" title="Delete"><i data-lucide="trash-2" class="h-4 w-4 text-red-600"></i></button>
                                        ${student.isPrefect ? '<span class="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"><i data-lucide="shield" class="h-3 w-3 mr-1"></i>Prefect</span>' : ''}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };
}

if (typeof window.loadPendingTeachers !== 'function') {
    console.warn('loadPendingTeachers not defined – using fallback');
    window.loadPendingTeachers = async function() {
        try {
            const response = await api.admin.getPendingApprovals();
            return response?.data?.teachers || [];
        } catch (error) {
            console.error('Fallback loadPendingTeachers error:', error);
            return [];
        }
    };
}

if (typeof window.renderTeachersTable !== 'function') {
    console.warn('renderTeachersTable not defined – using fallback');
    window.renderTeachersTable = function(teachers) {
        if (!teachers || teachers.length === 0) {
            return '<div class="text-center py-8 text-muted-foreground">No teachers found</div>';
        }
        return `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-muted/50">
                        <tr>
                            <th class="px-4 py-3 text-left font-medium">Teacher</th>
                            <th class="px-4 py-3 text-left font-medium">Email</th>
                            <th class="px-4 py-3 text-left font-medium">Subjects</th>
                            <th class="px-4 py-3 text-left font-medium">Status</th>
                            <th class="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${teachers.map(teacher => `
                            <tr class="hover:bg-accent/50 transition-colors">
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-3">
                                        <div class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                            <span class="font-medium text-blue-700 text-sm">${getInitials(teacher.User?.name || 'Unknown')}</span>
                                        </div>
                                        <span class="font-medium">${teacher.User?.name || 'Unknown'}</span>
                                    </div>
                                </td>
                                <td class="px-4 py-3">${teacher.User?.email || 'N/A'}</td>
                                <td class="px-4 py-3">${(teacher.subjects || []).join(', ')}</td>
                                <td class="px-4 py-3">
                                    <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${teacher.isActive === false ? 'bg-red-100 text-red-700' : (teacher.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}">
                                        ${teacher.isActive === false ? 'Suspended' : (teacher.approvalStatus === 'approved' ? 'Active' : 'Pending')}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <button onclick="viewTeacherDetails('${teacher.id}')" class="p-2 hover:bg-accent rounded-lg" title="View">
                                        <i data-lucide="eye" class="h-4 w-4"></i>
                                    </button>
                                    <button onclick="editTeacher('${teacher.id}')" class="p-2 hover:bg-accent rounded-lg" title="Edit">
                                        <i data-lucide="edit" class="h-4 w-4"></i>
                                    </button>
                                    <button onclick="suspendTeacher('${teacher.id}', '${escapeHtml(teacher.User?.name || 'Unknown')}')" class="p-2 hover:bg-yellow-100 rounded-lg text-yellow-600" title="Suspend">
                                        <i data-lucide="pause-circle" class="h-4 w-4"></i>
                                    </button>
                                    <button onclick="deleteTeacher('${teacher.id}')" class="p-2 hover:bg-red-100 rounded-lg text-red-600" title="Delete">
                                        <i data-lucide="trash-2" class="h-4 w-4"></i>
                                    </button>   
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };
}

if (typeof window.renderPendingTeachersTable !== 'function') {
    console.warn('renderPendingTeachersTable not defined – using fallback');
    window.renderPendingTeachersTable = function(teachers) {
        if (!teachers || teachers.length === 0) {
            return '<div class="text-center py-8 text-muted-foreground">No pending teachers</div>';
        }
        return `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-muted/50">
                        <tr>
                            <th class="px-4 py-3 text-left font-medium">Teacher</th>
                            <th class="px-4 py-3 text-left font-medium">Email</th>
                            <th class="px-4 py-3 text-left font-medium">Subjects</th>
                            <th class="px-4 py-3 text-left font-medium">Applied</th>
                            <th class="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${teachers.map(teacher => `
                            <tr class="hover:bg-accent/50 transition-colors">
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-3">
                                        <div class="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center">
                                            <span class="font-medium text-violet-700 text-sm">${getInitials(teacher.User?.name || 'Unknown')}</span>
                                        </div>
                                        <span class="font-medium">${teacher.User?.name || 'Unknown'}</span>
                                    </div>
                                </td>
                                <td class="px-4 py-3">${teacher.User?.email || 'N/A'}</td>
                                <td class="px-4 py-3">${(teacher.subjects || []).join(', ')}</td>
                                <td class="px-4 py-3">${timeAgo(teacher.createdAt)}</td>
                                <td class="px-4 py-3 text-right">
                                    <button onclick="approveTeacher('${teacher.id}')" class="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full hover:bg-green-200 mr-2">Approve</button>
                                    <button onclick="rejectTeacher('${teacher.id}')" class="px-3 py-1 bg-red-100 text-red-700 text-xs rounded-full hover:bg-red-200">Reject</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };
}

// Fallback for renderClassManagement
if (typeof window.renderClassManagement !== 'function') {
    window.renderClassManagement = async function() {
        return '<div class="text-center py-12">Class management module loading...</div>';
    };
}

if (typeof window.loadAllStudents !== 'function') {
    console.warn('loadAllStudents not defined – using fallback');
    window.loadAllStudents = async function() {
        try {
            const response = await api.admin.getStudents();
            return response.data || [];
        } catch (error) {
            console.error('Fallback loadAllStudents error:', error);
            return [];
        }
    };
}

// Helper to refresh class management if visible
async function refreshClassManagementIfVisible() {
    if (window.currentSection === 'classes' && typeof refreshClassesList === 'function') {
        await refreshClassesList();
        await showDashboardSection('classes');
    }
}

// ============ DYNAMIC MODAL CREATION ============
function ensureStudentModals() {
    if (!document.getElementById('student-details-modal')) {
        const modalHTML = `
            <div id="student-details-modal" class="fixed inset-0 z-50 hidden">
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeStudentDetailsModal()"></div>
                <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4">
                    <div class="rounded-2xl border bg-card shadow-2xl overflow-hidden">
                        <div class="bg-gradient-to-r from-green-600 to-teal-600 px-6 py-4 text-white flex justify-between items-center">
                            <h3 class="text-xl font-semibold">Student Details</h3>
                            <button onclick="closeStudentDetailsModal()" class="text-white hover:text-gray-200"><i data-lucide="x" class="h-5 w-5"></i></button>
                        </div>
                        <div id="student-details-content" class="p-6 space-y-4"></div>
                        <div class="px-6 py-4 bg-muted/30 flex justify-end gap-3">
                            <button onclick="closeStudentDetailsModal()" class="px-4 py-2 border rounded-lg hover:bg-accent">Close</button>
                            <button onclick="editStudentFromModal()" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">Edit Student</button>
                        </div>
                    </div>
                </div>
            </div>
            <div id="edit-student-modal" class="fixed inset-0 z-50 hidden">
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeEditStudentModal()"></div>
                <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4">
                    <div class="rounded-2xl border bg-card shadow-2xl overflow-hidden">
                        <div class="bg-gradient-to-r from-green-600 to-teal-600 px-6 py-4 text-white">
                            <h3 class="text-xl font-semibold">Edit Student</h3>
                        </div>
                        <div class="p-6 space-y-4">
                            <input type="hidden" id="edit-student-id">
                            <div><label class="block text-sm font-medium mb-1">Full Name</label><input type="text" id="edit-student-name" class="w-full rounded-lg border p-2"></div>
                            <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" id="edit-student-email" class="w-full rounded-lg border p-2"></div>
                            <div><label class="block text-sm font-medium mb-1">Grade</label><input type="text" id="edit-student-grade" class="w-full rounded-lg border p-2"></div>
                            <div><label class="block text-sm font-medium mb-1">Status</label>
                                <select id="edit-student-status" class="w-full rounded-lg border p-2">
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="graduated">Graduated</option>
                                    <option value="transferred">Transferred</option>
                                </select>
                            </div>
                            <div>
                                <label class="flex items-center gap-2">
                                    <input type="checkbox" id="edit-student-prefect" class="rounded">
                                    <span class="text-sm font-medium">School Prefect</span>
                                </label>
                            </div>
                        </div>
                        <div class="px-6 py-4 bg-muted/30 flex justify-end gap-3">
                            <button onclick="closeEditStudentModal()" class="px-4 py-2 border rounded-lg hover:bg-accent">Cancel</button>
                            <button onclick="saveStudentEdit()" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
}

function ensureTeacherModals() {
    if (!document.getElementById('teacher-details-modal')) {
        const modalHTML = `
            <div id="teacher-details-modal" class="fixed inset-0 z-50 hidden">
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeTeacherDetailsModal()"></div>
                <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4">
                    <div class="rounded-2xl border bg-card shadow-2xl overflow-hidden">
                        <div class="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white flex justify-between items-center">
                            <h3 class="text-xl font-semibold">Teacher Details</h3>
                            <button onclick="closeTeacherDetailsModal()" class="text-white hover:text-gray-200"><i data-lucide="x" class="h-5 w-5"></i></button>
                        </div>
                        <div id="teacher-details-content" class="p-6 space-y-4"></div>
                        <div class="px-6 py-4 bg-muted/30 flex justify-end gap-3">
                            <button onclick="closeTeacherDetailsModal()" class="px-4 py-2 border rounded-lg hover:bg-accent">Close</button>
                            <button onclick="editTeacherFromModal()" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">Edit Teacher</button>
                        </div>
                    </div>
                </div>
            </div>
            <div id="edit-teacher-modal" class="fixed inset-0 z-50 hidden">
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeEditTeacherModal()"></div>
                <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4">
                    <div class="rounded-2xl border bg-card shadow-2xl overflow-hidden">
                        <div class="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
                            <h3 class="text-xl font-semibold">Edit Teacher</h3>
                        </div>
                        <div class="p-6 space-y-4">
                            <input type="hidden" id="edit-teacher-id">
                            <div><label class="block text-sm font-medium mb-1">Full Name</label><input type="text" id="edit-teacher-name" class="w-full rounded-lg border p-2"></div>
                            <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" id="edit-teacher-email" class="w-full rounded-lg border p-2"></div>
                            <div><label class="block text-sm font-medium mb-1">Subjects (comma)</label><input type="text" id="edit-teacher-subjects" class="w-full rounded-lg border p-2"></div>
                            <div><label class="block text-sm font-medium mb-1">Department</label><input type="text" id="edit-teacher-department" class="w-full rounded-lg border p-2"></div>
                        </div>
                        <div class="px-6 py-4 bg-muted/30 flex justify-end gap-3">
                            <button onclick="closeEditTeacherModal()" class="px-4 py-2 border rounded-lg hover:bg-accent">Cancel</button>
                            <button onclick="saveTeacherEdit()" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
}

// ============ ADMIN STUDENT ACTIONS ============
window.adminViewStudentDetails = async function(studentId) {
    ensureStudentModals();
    const students = await window.loadAllStudents();
    const student = students.find(s => s.id == studentId);
    if (!student) { showToast('Student not found', 'error'); return; }
    const content = document.getElementById('student-details-content');
    content.innerHTML = `
        <div class="flex items-center gap-4 pb-4 border-b">
            <div class="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <span class="text-2xl font-bold text-green-600">${getInitials(student.User?.name)}</span>
            </div>
            <div><p class="text-lg font-semibold">${escapeHtml(student.User?.name)}</p><p class="text-sm text-muted-foreground">${escapeHtml(student.User?.email || 'No email')}</p></div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="font-medium">ELIMUID:</span> ${student.elimuid || 'N/A'}</div>
            <div><span class="font-medium">Grade:</span> ${student.grade || 'N/A'}</div>
            <div><span class="font-medium">Status:</span> <span class="px-2 py-0.5 rounded-full text-xs ${student.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${student.status}</span></div>
            <div><span class="font-medium">Enrolled:</span> ${new Date(student.createdAt).toLocaleDateString()}</div>
        </div>
    `;
    document.getElementById('student-details-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
};

window.adminEditStudent = async function(studentId) {
    ensureStudentModals();
    const students = await window.loadAllStudents();
    const student = students.find(s => s.id == studentId);
    if (!student) return;
    document.getElementById('edit-student-id').value = student.id;
    document.getElementById('edit-student-name').value = student.User?.name || '';
    document.getElementById('edit-student-email').value = student.User?.email || '';
    document.getElementById('edit-student-grade').value = student.grade || '';
    document.getElementById('edit-student-status').value = student.status || 'active';
    document.getElementById('edit-student-prefect').checked = student.isPrefect || false; // <-- new line
    document.getElementById('edit-student-modal').classList.remove('hidden');
};

window.adminSuspendStudent = async function(studentId, studentName) {
    if (!confirm(`Suspend ${studentName}?`)) return;
    try {
        await api.admin.updateStudent(studentId, { status: 'inactive' });
        showToast(`${studentName} suspended`, 'success');
        await renderAdminStudents();
    } catch (error) {
        showToast(error.message, 'error');
    }
};

window.adminReactivateStudent = async function(studentId, studentName) {
    if (!confirm(`Reactivate ${studentName}?`)) return;
    try {
        await api.admin.updateStudent(studentId, { status: 'active' });
        showToast(`${studentName} reactivated`, 'success');
        await renderAdminStudents();
    } catch (error) {
        showToast(error.message, 'error');
    }
};

window.adminDeleteStudent = async function(studentId, studentName) {
    if (!confirm(`Permanently delete ${studentName}? This cannot be undone.`)) return;
    try {
        await api.admin.deleteStudent(studentId);
        showToast(`${studentName} deleted`, 'success');
        await renderAdminStudents();
    } catch (error) {
        showToast(error.message, 'error');
    }
};

// ============ TEACHER ACTIONS ============
let currentTeacherId = null;

window.viewTeacherDetails = async function(teacherId) {
    ensureTeacherModals();
    const teachers = await window.loadAllTeachers();
    const teacher = teachers.find(t => t.id == teacherId);
    if (!teacher) { showToast('Teacher not found', 'error'); return; }
    currentTeacherId = teacher.id;
    const content = document.getElementById('teacher-details-content');
    content.innerHTML = `
        <div class="flex items-center gap-4 pb-4 border-b">
            <div class="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                <span class="text-2xl font-bold text-blue-600">${getInitials(teacher.User?.name)}</span>
            </div>
            <div><p class="text-lg font-semibold">${escapeHtml(teacher.User?.name)}</p><p class="text-sm text-muted-foreground">${escapeHtml(teacher.User?.email)}</p></div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="font-medium">Employee ID:</span> ${teacher.employeeId || 'N/A'}</div>
            <div><span class="font-medium">Department:</span> ${teacher.department || 'N/A'}</div>
            <div><span class="font-medium">Subjects:</span> ${teacher.subjects?.join(', ') || 'None'}</div>
            <div><span class="font-medium">Class Teacher:</span> ${teacher.classTeacher || 'No'}</div>
            <div><span class="font-medium">Status:</span> <span class="px-2 py-0.5 rounded-full text-xs ${teacher.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${teacher.approvalStatus}</span></div>
            <div><span class="font-medium">Joined:</span> ${new Date(teacher.dateJoined).toLocaleDateString()}</div>
        </div>
    `;
    document.getElementById('teacher-details-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
};

window.editTeacher = async function(teacherId) {
    ensureTeacherModals();
    const teachers = await window.loadAllTeachers();
    const teacher = teachers.find(t => t.id == teacherId);
    if (!teacher) return;
    document.getElementById('edit-teacher-id').value = teacher.id;
    document.getElementById('edit-teacher-name').value = teacher.User?.name || '';
    document.getElementById('edit-teacher-email').value = teacher.User?.email || '';
    document.getElementById('edit-teacher-subjects').value = (teacher.subjects || []).join(', ');
    document.getElementById('edit-teacher-department').value = teacher.department || '';
    document.getElementById('edit-teacher-modal').classList.remove('hidden');
};

window.suspendTeacher = async function(teacherId, teacherName) {
    if (!confirm(`⚠️ Suspend ${teacherName}? This teacher will no longer be able to log in.`)) return;
    showLoading();
    try {
        // Change approvalStatus to 'suspended' or 'rejected'
        await api.admin.updateTeacher(teacherId, { approvalStatus: 'suspended', isActive: false });
        showToast(`${teacherName} suspended`, 'success');
        await renderAdminTeachers();
    } catch (error) {
        showToast(error.message || 'Failed to suspend teacher', 'error');
    } finally {
        hideLoading();
    }
};

window.deleteTeacher = async function(teacherId) {
    if (!confirm('Delete this teacher? This action cannot be undone.')) return;
    try {
        await api.admin.deleteTeacher(teacherId);
        showToast('Teacher deleted', 'success');
        await renderAdminTeachers();
    } catch (error) {
        showToast(error.message, 'error');
    }
};

// Modal helper functions
window.closeStudentDetailsModal = function() { const m = document.getElementById('student-details-modal'); if(m) m.classList.add('hidden'); };
window.closeEditStudentModal = function() { const m = document.getElementById('edit-student-modal'); if(m) m.classList.add('hidden'); };
window.editStudentFromModal = function() { const id = document.getElementById('edit-student-id')?.value; if(id) { closeStudentDetailsModal(); adminEditStudent(id); } };
window.saveStudentEdit = async function() {
    const id = document.getElementById('edit-student-id')?.value;
    if (!id) return;
    showLoading();
    try {
        const name = document.getElementById('edit-student-name')?.value;
        const email = document.getElementById('edit-student-email')?.value?.trim();
        const grade = document.getElementById('edit-student-grade')?.value;
        const status = document.getElementById('edit-student-status')?.value;
        const isPrefect = document.getElementById('edit-student-prefect')?.checked || false;

        const updateData = { name, grade, status, isPrefect };
        // Only include email if it's a non‑empty valid email
        if (email) updateData.email = email;

        await api.admin.updateStudent(id, updateData);
        showToast('Student updated', 'success');
        closeEditStudentModal();
        await renderAdminStudents();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
};

window.closeTeacherDetailsModal = function() { const m = document.getElementById('teacher-details-modal'); if(m) m.classList.add('hidden'); };
window.closeEditTeacherModal = function() { const m = document.getElementById('edit-teacher-modal'); if(m) m.classList.add('hidden'); };
window.editTeacherFromModal = function() { const id = document.getElementById('edit-teacher-id')?.value; if(id) { closeTeacherDetailsModal(); editTeacher(id); } };
window.saveTeacherEdit = async function() {
    const id = document.getElementById('edit-teacher-id')?.value;
    if(!id) return;
    const subjects = document.getElementById('edit-teacher-subjects').value.split(',').map(s=>s.trim()).filter(s=>s);
    showLoading();
    try {
        await api.admin.updateTeacher(id, {
            name: document.getElementById('edit-teacher-name').value,
            email: document.getElementById('edit-teacher-email').value,
            subjects: subjects,
            department: document.getElementById('edit-teacher-department').value
        });
        showToast('Teacher updated', 'success');
        closeEditTeacherModal();
        await renderAdminTeachers();
    } catch(e) { showToast(e.message, 'error'); } finally { hideLoading(); }
};

// ============ RENDER ADMIN SECTION ============
async function renderAdminSection(section) {
    try {
        switch(section) {
            case 'help':
                return renderHelpSection();
            case 'dashboard':
                return renderAdminDashboard();
            case 'students':
                return await renderAdminStudents();
            case 'calendar':
                return renderAdminCalendar();
            case 'teachers':
                return await renderAdminTeachers();
            case 'teacher-approvals':
                return await renderAdminPendingTeachers();
            case 'classes':
                if (typeof window.renderClassManagement === 'function') {
                    const html = await window.renderClassManagement();
                    return html;
                } else if (typeof renderClassManagement === 'function') {
                    return await renderClassManagement();
                } else {
                    return '<div class="text-center py-12"><p class="text-red-500">Class management module not loaded. Please refresh the page.</p><button onclick="location.reload()" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Refresh Page</button></div>';
                }
            case 'duty':
                return await renderAdminDuty();
            case 'profile': return await renderProfileSection();    
            case 'fairness-report':
                return await renderAdminFairnessReport();
            case 'custom-subjects':
                return renderAdminCustomSubjects();
            case 'teacher-workload':
                return await renderAdminTeacherWorkload();
            case 'settings':
                return renderAdminSettings();
            default:
                return '<div class="text-center py-12">Section not found</div>';
        }
    } catch (error) {
        console.error('Error rendering admin section:', error);
        return `<div class="text-center py-12 text-red-500">Error loading section: ${error.message}</div>`;
    }
}

function renderAdminDashboard() {
    const school = getCurrentSchool();
    const data = dashboardData || {};
    return `
        <div class="space-y-6 animate-fade-in">
            <!-- School Profile Card -->
            <div class="rounded-xl border bg-card p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 card-hover">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div class="flex items-center gap-3 mb-2">
                            <h2 id="dashboard-school-name" class="text-2xl font-bold">${school?.name || 'Your School'}</h2>
                            <span class="px-3 py-1 ${school?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'} text-xs rounded-full">${school?.status || 'pending'}</span>
                        </div>
                        <div class="flex items-center gap-4">
                            <p class="text-sm"><span class="font-mono bg-muted px-2 py-1 rounded">Short Code: ${school?.shortCode || 'SHL-XXXXX'}</span></p>
                            <button onclick="showNameChangeModal()" class="text-sm text-primary hover:underline">Change School Name ($50)</button>
                        </div>
                    </div>
                    <div class="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm">
                        <p class="text-xs text-muted-foreground">Share this code with teachers</p>
                        <p class="text-lg font-mono font-bold">${school?.shortCode || 'SHL-XXXXX'}</p>
                    </div>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div class="rounded-xl border bg-card p-6 card-hover"><div class="flex items-center justify-between"><div><p class="text-sm font-medium text-muted-foreground">Total Students</p><h3 class="text-2xl font-bold mt-1" id="total-students">${data.students?.length || 0}</h3></div><div class="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center"><i data-lucide="users" class="h-6 w-6 text-blue-600"></i></div></div></div>
                <div class="rounded-xl border bg-card p-6 card-hover"><div class="flex items-center justify-between"><div><p class="text-sm font-medium text-muted-foreground">Teachers</p><h3 class="text-2xl font-bold mt-1" id="total-teachers">${data.teachers?.length || 0}</h3><p class="text-xs text-green-600 mt-1 flex items-center gap-1"><i data-lucide="trending-up" class="h-3 w-3"></i> +${data.pendingTeachers?.length || 0} pending approval</p></div><div class="h-12 w-12 rounded-lg bg-violet-100 flex items-center justify-center"><i data-lucide="user-plus" class="h-6 w-6 text-violet-600"></i></div></div></div>
                <div class="rounded-xl border bg-card p-6 card-hover"><div class="flex items-center justify-between"><div><p class="text-sm font-medium text-muted-foreground">Classes</p><h3 class="text-2xl font-bold mt-1" id="total-classes">${data.classes?.length || 0}</h3></div><div class="h-12 w-12 rounded-lg bg-emerald-100 flex items-center justify-center"><i data-lucide="book-open" class="h-6 w-6 text-emerald-600"></i></div></div></div>
                <div class="rounded-xl border bg-card p-6 card-hover"><div class="flex items-center justify-between"><div><p class="text-sm font-medium text-muted-foreground">Attendance Rate</p><h3 class="text-2xl font-bold mt-1">94.2%</h3></div><div class="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center"><i data-lucide="calendar-check" class="h-6 w-6 text-amber-600"></i></div></div></div>
            </div>

            <!-- Quick Actions -->
            <div class="grid gap-4 md:grid-cols-3">
                <button onclick="showDashboardSection('teacher-approvals')" class="p-6 border rounded-lg hover:bg-accent transition-colors text-left">
                    <i data-lucide="user-plus" class="h-8 w-8 text-blue-600 mb-3"></i>
                    <h4 class="font-semibold">Teacher Approvals</h4>
                    <p class="text-sm text-muted-foreground">Approve pending teachers</p>
                    <span class="mt-2 inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700" id="pending-count-badge">${data.pendingTeachers?.length || 0} pending</span>
                </button>
                <button onclick="showDashboardSection('students')" class="p-6 border rounded-lg hover:bg-accent transition-colors text-left">
                    <i data-lucide="users" class="h-8 w-8 text-green-600 mb-3"></i>
                    <h4 class="font-semibold">Student Management</h4>
                    <p class="text-sm text-muted-foreground">View and manage all students</p>
                </button>
                <button onclick="showDashboardSection('settings')" class="p-6 border rounded-lg hover:bg-accent transition-colors text-left">
                    <i data-lucide="settings" class="h-8 w-8 text-purple-600 mb-3"></i>
                    <h4 class="font-semibold">School Settings</h4>
                    <p class="text-sm text-muted-foreground">Configure curriculum and subjects</p>
                </button>
            </div>

            <!-- Send Announcement Card (NEW) -->
            <div class="rounded-xl border bg-card p-6">
                <h3 class="font-semibold mb-4 flex items-center gap-2">
                    <i data-lucide="megaphone" class="h-5 w-5 text-primary"></i>
                    📢 Send Announcement
                </h3>
                <div class="space-y-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">Recipients</label>
                        <select id="announcement-recipients" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                            <option value="all_parents">All Parents</option>
                            <option value="specific_class">Specific Class</option>
                            <option value="individual_parent">Individual Parent</option>
                        </select>
                    </div>
                    <div id="class-selector-container" class="hidden">
                        <label class="block text-sm font-medium mb-1">Select Class</label>
                        <select id="announcement-class" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                            <option value="">Loading classes...</option>
                        </select>
                    </div>
                    <div id="parent-selector-container" class="hidden">
                        <label class="block text-sm font-medium mb-1">Select Parent</label>
                        <select id="announcement-parent" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                            <option value="">Loading parents...</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Title</label>
                        <input type="text" id="announcement-title" placeholder="Announcement Title" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Message</label>
                        <textarea id="announcement-message" rows="3" placeholder="Your message..." class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"></textarea>
                    </div>
                    <button onclick="sendAnnouncement()" class="w-full bg-primary text-primary-foreground py-2 rounded-lg hover:bg-primary/90">Send Announcement</button>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="grid gap-4 lg:grid-cols-2">
                <div class="rounded-xl border bg-card p-6"><div class="flex items-center justify-between mb-4"><h3 class="font-semibold">Enrollment Trends</h3></div><div class="chart-container h-64"><canvas id="admin-enrollmentChart"></canvas></div></div>
                <div class="rounded-xl border bg-card p-6"><div class="flex items-center justify-between mb-4"><h3 class="font-semibold">Grade Distribution</h3></div><div class="chart-container h-64"><canvas id="admin-gradeChart"></canvas></div></div>
            </div>
        </div>
    `;
}

// ============ REPLACE renderAdminStudents WITH THIS VERSION ============
async function renderAdminStudents() {
    try {
        const [classesRes, studentsRes] = await Promise.all([
            api.admin.getClasses(),
            api.admin.getStudents()
        ]);
        const classes = classesRes.data || [];
        const allStudents = studentsRes.data || [];

        // Group students by grade (class name)
        const studentsByGrade = {};
        allStudents.forEach(s => {
            const grade = s.grade || 'Unassigned';
            if (!studentsByGrade[grade]) studentsByGrade[grade] = [];
            studentsByGrade[grade].push(s);
        });

        // Determine selected class from localStorage or default
        let selectedClassName = localStorage.getItem('adminSelectedClass');
        if (!selectedClassName || !studentsByGrade[selectedClassName]) {
            selectedClassName = classes.length > 0 ? classes[0].name : (Object.keys(studentsByGrade)[0] || '');
        }
        localStorage.setItem('adminSelectedClass', selectedClassName);

        const selectedStudents = studentsByGrade[selectedClassName] || [];

        // Stats for selected class
        const totalInClass = selectedStudents.length;
        const activeInClass = selectedStudents.filter(s => s.status === 'active').length;
        const inactiveInClass = selectedStudents.filter(s => s.status === 'inactive').length;
        const graduatedInClass = selectedStudents.filter(s => s.status === 'graduated').length;

        // Overall stats
        const totalAll = allStudents.length;
        const activeAll = allStudents.filter(s => s.status === 'active').length;
        const inactiveAll = allStudents.filter(s => s.status === 'inactive').length;
        const graduatedAll = allStudents.filter(s => s.status === 'graduated').length;

        // Build class list HTML
        let classListHtml = classes.map(cls => {
            const count = (studentsByGrade[cls.name] || []).length;
            const isSelected = cls.name === selectedClassName;
            return `
                <div class="class-item p-3 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
                     data-class-name="${escapeHtml(cls.name)}"
                     onclick="selectAdminClass('${escapeHtml(cls.name).replace(/'/g, "\\'")}')">
                    <div class="flex justify-between items-center">
                        <span class="font-medium">${escapeHtml(cls.name)}</span>
                        <span class="text-xs ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}">${count} students</span>
                    </div>
                    ${cls.stream ? `<p class="text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}">Stream: ${escapeHtml(cls.stream)}</p>` : ''}
                </div>
            `;
        }).join('');

        // Also show grades that have students but no class record
        const classNamesFromClasses = new Set(classes.map(c => c.name));
        const orphanGrades = Object.keys(studentsByGrade).filter(g => !classNamesFromClasses.has(g) && g !== 'Unassigned');
        orphanGrades.forEach(grade => {
            const count = studentsByGrade[grade].length;
            const isSelected = grade === selectedClassName;
            classListHtml += `
                <div class="class-item p-3 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
                     data-class-name="${escapeHtml(grade)}"
                     onclick="selectAdminClass('${escapeHtml(grade).replace(/'/g, "\\'")}')">
                    <div class="flex justify-between items-center">
                        <span class="font-medium">${escapeHtml(grade)}</span>
                        <span class="text-xs ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}">${count} students</span>
                    </div>
                    <p class="text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}">No class record</p>
                </div>
            `;
        });

        // Students table for selected class
        const studentsTableHtml = selectedStudents.length === 0 ? `
            <div class="text-center py-12 text-muted-foreground">
                <i data-lucide="users" class="h-12 w-12 mx-auto mb-3 opacity-50"></i>
                <p>No students in this class</p>
            </div>
        ` : `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-muted/50 sticky top-0">
                        <tr>
                            <th class="px-4 py-3 text-left font-medium">Student</th>
                            <th class="px-4 py-3 text-left font-medium">ELIMUID</th>
                            <th class="px-4 py-3 text-left font-medium">Status</th>
                            <th class="px-4 py-3 text-left font-medium">Parent Email</th>
                            <th class="px-4 py-3 text-center font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${selectedStudents.map(student => {
                            const user = student.User || {};
                            const name = user.name || 'Unknown';
                            const email = user.email || 'N/A';
                            const status = student.status || 'active';
                            const statusClass = status === 'active' ? 'bg-green-100 text-green-700' : 
                                               status === 'inactive' ? 'bg-red-100 text-red-700' : 
                                               'bg-gray-100 text-gray-700';
                            const initials = getInitials(name);
                            const photoUrl = user.profileImage || '';
                            const isPrefect = student.isPrefect || false;

                            return `
                                <tr class="hover:bg-accent/50 transition-colors">
                                    <td class="px-4 py-3">
                                        <div class="flex items-center gap-3">
                                            ${photoUrl ? 
                                                `<img src="${photoUrl}" class="h-8 w-8 rounded-full object-cover">` :
                                                `<div class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                                    <span class="font-medium text-blue-700 text-sm">${initials}</span>
                                                </div>`
                                            }
                                            <div>
                                                <span class="font-medium">${escapeHtml(name)}</span>
                                                ${isPrefect ? '<span class="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"><i data-lucide="shield" class="h-3 w-3 mr-1"></i>Prefect</span>' : ''}
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class="font-mono text-xs bg-muted px-2 py-1 rounded">${escapeHtml(student.elimuid || 'N/A')}</span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-1 ${statusClass} text-xs rounded-full">${status}</span>
                                    </td>
                                    <td class="px-4 py-3">${escapeHtml(email)}</td>
                                    <td class="px-4 py-3 text-center">
                                        <div class="flex items-center justify-center gap-1">
                                            <button onclick="showUnifiedStudentModal('${student.id}')" class="p-2 hover:bg-accent rounded-lg" title="View Details">
                                                <i data-lucide="eye" class="h-4 w-4 text-blue-600"></i>
                                            </button>
                                            <button onclick="adminEditStudent('${student.id}')" class="p-2 hover:bg-accent rounded-lg" title="Edit">
                                                <i data-lucide="edit" class="h-4 w-4 text-green-600"></i>
                                            </button>
                                            ${status === 'active' ? 
                                                `<button onclick="adminSuspendStudent('${student.id}', '${escapeHtml(name).replace(/'/g, "\\'")}')" class="p-2 hover:bg-yellow-100 rounded-lg" title="Suspend">
                                                    <i data-lucide="pause-circle" class="h-4 w-4 text-yellow-600"></i>
                                                </button>` : 
                                                `<button onclick="adminReactivateStudent('${student.id}', '${escapeHtml(name).replace(/'/g, "\\'")}')" class="p-2 hover:bg-green-100 rounded-lg" title="Reactivate">
                                                    <i data-lucide="play-circle" class="h-4 w-4 text-green-600"></i>
                                                </button>`
                                            }
                                            <button onclick="adminDeleteStudent('${student.id}', '${escapeHtml(name).replace(/'/g, "\\'")}')" class="p-2 hover:bg-red-100 rounded-lg" title="Delete">
                                                <i data-lucide="trash-2" class="h-4 w-4 text-red-600"></i>
                                            </button>
                                            <button onclick="copyToClipboard('${escapeHtml(student.elimuid).replace(/'/g, "\\'")}')" class="p-2 hover:bg-purple-100 rounded-lg" title="Copy ELIMUID">
                                                <i data-lucide="copy" class="h-4 w-4 text-purple-600"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        return `
            <div class="space-y-6 animate-fade-in">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-bold">Student Management</h2>
                    <button onclick="showAddStudentModal()" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2">
                        <i data-lucide="plus" class="h-4 w-4"></i>
                        Add Student
                    </button>
                </div>

                <!-- Overall Stats -->
                <div class="grid gap-4 md:grid-cols-4">
                    <div class="rounded-xl border bg-card p-4">
                        <p class="text-sm text-muted-foreground">Total Students</p>
                        <p class="text-2xl font-bold">${totalAll}</p>
                    </div>
                    <div class="rounded-xl border bg-card p-4">
                        <p class="text-sm text-muted-foreground">Active</p>
                        <p class="text-2xl font-bold text-green-600">${activeAll}</p>
                    </div>
                    <div class="rounded-xl border bg-card p-4">
                        <p class="text-sm text-muted-foreground">Inactive</p>
                        <p class="text-2xl font-bold text-red-600">${inactiveAll}</p>
                    </div>
                    <div class="rounded-xl border bg-card p-4">
                        <p class="text-sm text-muted-foreground">Graduated</p>
                        <p class="text-2xl font-bold text-blue-600">${graduatedAll}</p>
                    </div>
                </div>

                <!-- Class Selector + Students Panel -->
                <div class="flex flex-col lg:flex-row gap-6">
                    <!-- Left Sidebar: Classes -->
                    <div class="lg:w-72 flex-shrink-0">
                        <div class="rounded-xl border bg-card overflow-hidden">
                            <div class="p-4 border-b bg-muted/30">
                                <h3 class="font-semibold flex items-center gap-2">
                                    <i data-lucide="book-open" class="h-5 w-5"></i>
                                    Classes
                                </h3>
                                <p class="text-xs text-muted-foreground mt-1">Select a class to view students</p>
                            </div>
                            <div class="p-2 max-h-[500px] overflow-y-auto" id="class-list-container">
                                ${classListHtml || '<p class="text-center py-4 text-muted-foreground">No classes found</p>'}
                            </div>
                        </div>
                    </div>

                    <!-- Right Panel: Students in Selected Class -->
                    <div class="flex-1 min-w-0">
                        <div class="rounded-xl border bg-card overflow-hidden">
                            <div class="p-4 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 class="font-semibold flex items-center gap-2">
                                        <i data-lucide="users" class="h-5 w-5"></i>
                                        ${escapeHtml(selectedClassName)} Students
                                    </h3>
                                    <p class="text-xs text-muted-foreground mt-1">
                                        ${totalInClass} total · ${activeInClass} active · ${inactiveInClass} inactive
                                    </p>
                                </div>
                                <div class="relative">
                                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"></i>
                                    <input type="text" id="class-student-search" placeholder="Search in this class..." 
                                           class="pl-9 pr-4 py-2 text-sm rounded-md border bg-background w-64"
                                           oninput="filterStudentsInCurrentClass(this.value)">
                                </div>
                            </div>
                            <div id="selected-class-students-container">
                                ${studentsTableHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading students:', error);
        return `<div class="text-center py-12 text-red-500">Error loading students: ${error.message}</div>`;
    }
}

// ============ HELPER FUNCTIONS (ADD THESE TO GLOBAL SCOPE) ============

// Called when a class is clicked in the sidebar
window.selectAdminClass = function(className) {
    localStorage.setItem('adminSelectedClass', className);
    showDashboardSection('students'); // Re-render the section
};

// Filter students within the currently displayed class (client-side)
window.filterStudentsInCurrentClass = function(searchTerm) {
    const container = document.getElementById('selected-class-students-container');
    if (!container) return;
    
    const rows = container.querySelectorAll('tbody tr');
    const term = searchTerm.toLowerCase().trim();
    
    let visibleCount = 0;
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const match = term === '' || text.includes(term);
        row.style.display = match ? '' : 'none';
        if (match) visibleCount++;
    });
    
    // Optionally show a "no results" message
    const existingMsg = document.getElementById('no-search-results');
    if (visibleCount === 0 && term !== '') {
        if (!existingMsg) {
            const msg = document.createElement('div');
            msg.id = 'no-search-results';
            msg.className = 'text-center py-8 text-muted-foreground';
            msg.innerHTML = `<i data-lucide="search-x" class="h-12 w-12 mx-auto mb-3 opacity-50"></i><p>No students match "${escapeHtml(searchTerm)}"</p>`;
            container.appendChild(msg);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else if (existingMsg) {
        existingMsg.remove();
    }
};

// Helper: escape HTML (ensure available globally)
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"]/g, function(c) {
        if (c === '&') return '&amp;';
        if (c === '<') return '&lt;';
        if (c === '>') return '&gt;';
        if (c === '"') return '&quot;';
        return c;
    });
}

async function renderAdminTeachers() {
    try {
        const teachers = await window.loadAllTeachers();
        const tableHtml = window.renderTeachersTable(teachers);
        return `<div class="space-y-6 animate-fade-in"><h2 class="text-2xl font-bold">Teacher Management</h2><div class="rounded-xl border bg-card overflow-hidden">${tableHtml}</div></div>`;
    } catch (error) {
        return `<div class="text-center py-12 text-red-500">Error loading teachers: ${error.message}</div>`;
    }
}

async function renderAdminPendingTeachers() {
    try {
        const teachers = await window.loadPendingTeachers();
        return `<div class="space-y-6 animate-fade-in"><h2 class="text-2xl font-bold">Pending Teacher Approvals</h2><div class="rounded-xl border bg-card overflow-hidden">${window.renderPendingTeachersTable(teachers)}</div></div>`;
    } catch (error) {
        return `<div class="text-center py-12 text-red-500">Error loading pending teachers: ${error.message}</div>`;
    }
}

async function renderAdminDuty() {
    try {
        const todayDuty = await loadTodayDuty();
        const weeklyDuty = await loadWeeklyDuty();
        const understaffed = await loadUnderstaffedAreas();
        return `
            <div class="space-y-6 animate-fade-in">
                <div class="flex justify-between items-center"><h2 class="text-2xl font-bold">Duty Management</h2><button onclick="handleGenerateDutyRoster()" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2"><i data-lucide="refresh-cw" class="h-4 w-4"></i> Generate New Roster</button></div>
                ${understaffed && understaffed.length > 0 ? `<div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"><div class="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2"><i data-lucide="alert-triangle" class="h-5 w-5"></i><h3 class="font-semibold">Understaffed Areas Detected</h3></div><div class="space-y-2">${understaffed.map(area => `<div class="text-sm text-red-600 dark:text-red-400">${area.date}: ${area.areas.map(a => `${a.area} (need ${a.required}, have ${a.current})`).join(', ')}</div>`).join('')}</div></div>` : ''}
                <div class="grid gap-4 md:grid-cols-2">
                    <div class="rounded-xl border bg-card p-6"><h3 class="font-semibold mb-4">Generate Duty Roster</h3><div class="space-y-3"><div><label class="block text-sm font-medium mb-1">Start Date</label><input type="date" id="duty-start-date" value="${new Date().toISOString().split('T')[0]}" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"></div><div><label class="block text-sm font-medium mb-1">End Date</label><input type="date" id="duty-end-date" value="${new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]}" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"></div><button onclick="handleGenerateDutyRoster()" class="w-full bg-primary text-primary-foreground py-2 rounded-lg hover:bg-primary/90">Generate Roster</button></div></div>
                    <div class="rounded-xl border bg-card p-6"><h3 class="font-semibold mb-4">Quick Actions</h3><div class="space-y-2"><button onclick="showDashboardSection('fairness-report')" class="w-full text-left p-3 hover:bg-accent rounded-lg flex items-center gap-3"><i data-lucide="bar-chart-2" class="h-5 w-5 text-blue-600"></i><div><p class="font-medium">Fairness Report</p><p class="text-xs text-muted-foreground">View duty distribution analytics</p></div></button><button onclick="showDashboardSection('teacher-workload')" class="w-full text-left p-3 hover:bg-accent rounded-lg flex items-center gap-3"><i data-lucide="users" class="h-5 w-5 text-green-600"></i><div><p class="font-medium">Teacher Workload</p><p class="text-xs text-muted-foreground">Monitor duty load per teacher</p></div></button></div></div>
                </div>
                <div class="rounded-xl border bg-card p-6"><h3 class="font-semibold mb-4">Today's Duty (${new Date().toLocaleDateString()})</h3><div class="space-y-3">${todayDuty?.duties?.length > 0 ? todayDuty.duties.map(duty => `<div class="flex items-center justify-between p-3 bg-muted/30 rounded-lg"><div><p class="font-medium">${duty.area}</p><p class="text-sm text-muted-foreground">${duty.timeSlot?.start} - ${duty.timeSlot?.end}</p></div><div class="text-right"><p class="font-medium">${duty.teacherName}</p><p class="text-xs ${duty.checkedIn ? 'text-green-600' : 'text-yellow-600'}">${duty.checkedIn ? '✓ Checked In' : '⏳ Pending'}</p></div></div>`).join('') : '<p class="text-center text-muted-foreground py-4">No duty today</p>'}</div></div>
                <div class="rounded-xl border bg-card p-6"><h3 class="font-semibold mb-4">Weekly Schedule</h3><div class="space-y-3">${weeklyDuty?.map(day => `<div class="border rounded-lg overflow-hidden"><div class="bg-muted/30 px-4 py-2 font-medium ${day.isToday ? 'bg-primary/10' : ''}">${day.dayName} ${day.isToday ? '(Today)' : ''}</div><div class="p-3 space-y-2">${day.duties.length > 0 ? day.duties.map(duty => `<div class="flex justify-between text-sm"><span>${duty.area}</span><span>${duty.teacherName}</span></div>`).join('') : '<p class="text-sm text-muted-foreground">No duty</p>'}</div></div>`).join('')}</div></div>
            </div>
        `;
    } catch (error) {
        return `<div class="text-center py-12 text-red-500">Error loading duty: ${error.message}</div>`;
    }
}

async function renderAdminFairnessReport() {
    showLoading();
    try {
        const report = await api.admin.getFairnessReport();
        const fairnessData = report.data || {};
        const hasData = fairnessData.summary && fairnessData.summary.fairnessScore !== undefined;
        return `
            <div class="space-y-6 animate-fade-in">
                <div class="flex justify-between items-center"><h2 class="text-2xl font-bold">Duty Fairness Report</h2><button onclick="renderAdminFairnessReport()" class="px-4 py-2 border rounded-lg hover:bg-accent"><i data-lucide="refresh-cw" class="h-4 w-4"></i> Refresh</button></div>
                ${!hasData ? `<div class="rounded-xl border bg-card p-12 text-center"><i data-lucide="bar-chart-2" class="h-12 w-12 mx-auto text-muted-foreground mb-4"></i><p class="text-muted-foreground">No fairness data available yet.</p><p class="text-xs text-muted-foreground mt-1">Go to Duty Management and generate a roster to see metrics.</p><button onclick="showDashboardSection('duty')" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Go to Duty Management</button></div>` : `
                    <div class="grid gap-4 md:grid-cols-3"><div class="rounded-xl border bg-card p-6"><p class="text-sm text-muted-foreground">Fairness Score</p><div class="flex items-end gap-2"><h3 class="text-3xl font-bold">${fairnessData.summary?.fairnessScore || 0}%</h3><span class="text-sm text-muted-foreground mb-1">/ 100</span></div></div><div class="rounded-xl border bg-card p-6"><p class="text-sm text-muted-foreground">Total Duties</p><h3 class="text-3xl font-bold">${fairnessData.summary?.totalDuties || 0}</h3></div><div class="rounded-xl border bg-card p-6"><p class="text-sm text-muted-foreground">Teachers</p><h3 class="text-3xl font-bold">${fairnessData.teacherStats?.length || 0}</h3></div></div>
                    <div class="rounded-xl border bg-card overflow-hidden"><div class="p-4 border-b"><h3 class="font-semibold">Teacher Workload Distribution</h3></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-muted/50"><tr><th class="px-4 py-3 text-left">Teacher</th><th class="px-4 py-3 text-left">Department</th><th class="px-4 py-3 text-center">Scheduled</th><th class="px-4 py-3 text-center">Completed</th><th class="px-4 py-3 text-center">Completion Rate</th></tr></thead><tbody class="divide-y">${(fairnessData.teacherStats || []).map(t => `<tr class="hover:bg-accent/50"><td class="px-4 py-3 font-medium">${t.teacherName}</td><td class="px-4 py-3">${t.department}</td><td class="px-4 py-3 text-center">${t.scheduled}</td><td class="px-4 py-3 text-center">${t.completed}</td><td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${t.completionRate >= 80 ? 'bg-green-100 text-green-700' : t.completionRate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${t.completionRate}%</span></td></tr>`).join('')}${(!fairnessData.teacherStats || fairnessData.teacherStats.length === 0) ? '<tr><td colspan="5" class="text-center py-8 text-muted-foreground">No data available</td></tr>' : ''}</tbody></table></div></div>
                `}
            </div>
        `;
    } catch (error) {
        return `<div class="text-center py-12 text-red-500">Error loading fairness report: ${error.message}</div>`;
    } finally { hideLoading(); }
}

async function renderAdminTeacherWorkload() {
    try {
        const workload = await loadTeacherWorkload();
        const teachers = workload || [];
        const hasData = teachers.length > 0;
        return `
            <div class="space-y-6 animate-fade-in">
                <h2 class="text-2xl font-bold">Teacher Workload Monitor</h2>
                ${!hasData ? `<div class="rounded-xl border bg-card p-12 text-center"><i data-lucide="users" class="h-12 w-12 mx-auto text-muted-foreground mb-4"></i><p class="text-muted-foreground">No workload data available yet.</p><p class="text-xs text-muted-foreground mt-1">Once duties are assigned, teacher workloads will appear here.</p><button onclick="showDashboardSection('duty')" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Go to Duty Management</button></div>` : `
                    <div class="grid gap-4 md:grid-cols-3"><div class="rounded-xl border bg-card p-6"><p class="text-sm text-muted-foreground">Overworked Teachers</p><h3 class="text-3xl font-bold text-red-600">${teachers.filter(t => t.status === 'overworked').length}</h3></div><div class="rounded-xl border bg-card p-6"><p class="text-sm text-muted-foreground">Balanced Teachers</p><h3 class="text-3xl font-bold text-green-600">${teachers.filter(t => t.status === 'balanced').length}</h3></div><div class="rounded-xl border bg-card p-6"><p class="text-sm text-muted-foreground">Underworked Teachers</p><h3 class="text-3xl font-bold text-yellow-600">${teachers.filter(t => t.status === 'underworked').length}</h3></div></div>
                    <div class="rounded-xl border bg-card overflow-hidden"><div class="p-4 border-b"><h3 class="font-semibold">Current Workload Distribution</h3></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-muted/50"><tr><th class="px-4 py-3 text-left">Teacher</th><th class="px-4 py-3 text-left">Department</th><th class="px-4 py-3 text-center">Monthly Duties</th><th class="px-4 py-3 text-center">Weekly Duties</th><th class="px-4 py-3 text-center">Reliability</th><th class="px-4 py-3 text-center">Status</th></tr></thead><tbody class="divide-y">${teachers.map(teacher => `<tr class="hover:bg-accent/50"><td class="px-4 py-3 font-medium">${teacher.teacherName}</td><td class="px-4 py-3">${teacher.department}</td><td class="px-4 py-3 text-center">${teacher.monthlyDutyCount}</td><td class="px-4 py-3 text-center">${teacher.weeklyDutyCount}</td><td class="px-4 py-3 text-center">${teacher.reliabilityScore}</td><td class="px-4 py-3 text-center"><span class="px-2 py-1 ${teacher.status === 'overworked' ? 'bg-red-100 text-red-700' : teacher.status === 'underworked' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'} text-xs rounded-full">${teacher.status}</span></td></tr>`).join('')}</tbody></table></div></div>
                `}
            </div>
        `;
    } catch (error) {
        return `<div class="text-center py-12 text-red-500">Error loading workload: ${error.message}</div>`;
    }
}

function renderAdminSettings() {
    const curriculum = schoolSettings.curriculum || schoolSettings.system || 'cbc';
    const schoolLevel = schoolSettings.settings?.schoolLevel || 'secondary';
    const curriculumInfo = (window.CURRICULUMS && window.CURRICULUMS[curriculum]) ? window.CURRICULUMS[curriculum] : { subjects: { secondary: [] } };
    const levelInfo = curriculumInfo?.levels[schoolLevel] || [];
    const subjectInfo = curriculumInfo?.subjects[schoolLevel] || [];
    return `
        <div class="space-y-6 animate-fade-in">
            <h2 class="text-2xl font-bold">School Settings</h2>
            <p class="text-sm text-muted-foreground">Changes made here will reflect across all dashboards for this school.</p>
            <div class="grid gap-6">
                <div class="rounded-xl border bg-card p-6"><h3 class="font-semibold mb-4">School Information</h3><div class="space-y-4"><div><label class="block text-sm font-medium mb-1">School Name</label><input type="text" id="settings-school-name" value="${schoolSettings.name || schoolSettings.schoolName || ''}" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"></div><div><label class="block text-sm font-medium mb-1">School Level</label><select id="settings-school-level" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"><option value="primary" ${schoolLevel === 'primary' ? 'selected' : ''}>Primary</option><option value="secondary" ${schoolLevel === 'secondary' ? 'selected' : ''}>Secondary</option><option value="both" ${schoolLevel === 'both' ? 'selected' : ''}>Both</option></select></div></div></div>
                <div class="rounded-xl border bg-card p-6"><h3 class="font-semibold mb-4">Curriculum Settings</h3><div class="space-y-4"><div><label class="block text-sm font-medium mb-1">Select Curriculum</label><select id="settings-curriculum" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"><option value="cbc" ${curriculum === 'cbc' ? 'selected' : ''}>CBC</option><option value="844" ${curriculum === '844' ? 'selected' : ''}>8-4-4</option><option value="british" ${curriculum === 'british' ? 'selected' : ''}>British</option><option value="american" ${curriculum === 'american' ? 'selected' : ''}>American</option></select></div><div class="p-4 bg-muted/30 rounded-lg"><h4 class="font-sm font-medium mb-2">Curriculum Information</h4><p class="text-sm text-muted-foreground"><span class="font-medium">Name:</span> ${curriculumInfo?.name || 'N/A'}</p><p class="text-sm text-muted-foreground mt-1"><span class="font-medium">Grade Levels:</span> ${levelInfo.join(', ')}</p><p class="text-sm text-muted-foreground mt-1"><span class="font-medium">Core Subjects:</span> ${subjectInfo.join(', ')}</p></div></div></div>
                <div class="flex justify-end"><button onclick="saveAllSettings()" class="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">Save Settings</button></div>
            </div>
        </div>
    `;
}

// ============ PROFILE SECTION ============
async function renderProfileSection() {
  const user = getCurrentUser();
  const emailPref = user.preferences?.email !== false;
  const pushPref = user.preferences?.push !== false;
  const darkModePref = document.documentElement.classList.contains('dark');

  return `
    <div class="space-y-6 max-w-4xl mx-auto">
      <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-white">
        <div class="flex items-center gap-6">
          <div class="relative">
            <img id="profile-preview" src="${user.profileImage || ''}" class="h-24 w-24 rounded-full object-cover border-4 border-white shadow bg-white">
            <label class="absolute bottom-0 right-0 bg-primary text-white rounded-full p-1 cursor-pointer">
              <i data-lucide="camera" class="h-4 w-4"></i>
              <input type="file" id="profile-picture-input" accept="image/*" class="hidden" onchange="uploadProfilePicture(this.files[0])">
            </label>
          </div>
          <div>
            <h2 class="text-3xl font-bold">${user.name}</h2>
            <p class="text-white/80 capitalize">${user.role}</p>
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <div class="rounded-xl border bg-card p-4"><p class="text-sm text-muted-foreground">Member Since</p><p class="text-lg font-semibold">${formatDate(user.createdAt)}</p></div>
        <div class="rounded-xl border bg-card p-4"><p class="text-sm text-muted-foreground">Last Login</p><p class="text-lg font-semibold">${user.lastLogin ? timeAgo(user.lastLogin) : 'N/A'}</p></div>
        <div class="rounded-xl border bg-card p-4"><p class="text-sm text-muted-foreground">Account Status</p><p class="text-lg font-semibold text-green-600">Active</p></div>
      </div>

      <div class="rounded-xl border bg-card p-6">
        <h3 class="font-semibold text-lg mb-4">Profile Information</h3>
        <form id="profile-form" onsubmit="updateProfile(event)" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <div><label class="block text-sm font-medium mb-1">Full Name</label><input type="text" name="name" value="${user.name}" class="w-full rounded-lg border p-2 bg-background"></div>
            <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" name="email" value="${user.email || ''}" class="w-full rounded-lg border p-2 bg-background"></div>
          </div>
          <div><label class="block text-sm font-medium mb-1">Phone</label><input type="tel" name="phone" value="${user.phone || ''}" class="w-full rounded-lg border p-2 bg-background"></div>
          <div class="flex justify-end"><button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg">Update Profile</button></div>
        </form>
      </div>

      <div class="rounded-xl border bg-card p-6">
        <h3 class="font-semibold text-lg mb-4">Change Password</h3>
        <form id="password-form" onsubmit="updatePassword(event)" class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Current Password</label><input type="password" id="current-password" required class="w-full rounded-lg border p-2 bg-background"></div>
          <div class="grid gap-4 md:grid-cols-2">
            <div><label class="block text-sm font-medium mb-1">New Password</label><input type="password" id="new-password" required minlength="8" class="w-full rounded-lg border p-2 bg-background"></div>
            <div><label class="block text-sm font-medium mb-1">Confirm Password</label><input type="password" id="confirm-password" required class="w-full rounded-lg border p-2 bg-background"></div>
          </div>
          <div class="flex justify-end"><button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg">Update Password</button></div>
        </form>
      </div>

      <div class="rounded-xl border bg-card p-6">
        <h3 class="font-semibold text-lg mb-4">Preferences</h3>
        <div class="space-y-4">
          <div class="flex justify-between items-center">
            <div><p class="font-medium">Email Notifications</p></div>
            <button onclick="togglePreference('email')" id="pref-email" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${emailPref ? 'bg-primary' : 'bg-muted'}">
              <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emailPref ? 'translate-x-6' : 'translate-x-1'}"></span>
            </button>
          </div>
          <div class="flex justify-between items-center">
            <div><p class="font-medium">Push Notifications</p></div>
            <button onclick="togglePreference('push')" id="pref-push" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pushPref ? 'bg-primary' : 'bg-muted'}">
              <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pushPref ? 'translate-x-6' : 'translate-x-1'}"></span>
            </button>
          </div>
          <div class="flex justify-between items-center">
            <div><p class="font-medium">Dark Mode</p></div>
            <button onclick="toggleTheme()" id="pref-darkmode" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkModePref ? 'bg-primary' : 'bg-muted'}">
              <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkModePref ? 'translate-x-6' : 'translate-x-1'}"></span>
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6">
        <h3 class="font-semibold text-lg mb-4 text-red-700 dark:text-red-400">Account Actions</h3>
        <div class="flex gap-3">
          <button onclick="downloadMyData()" class="px-4 py-2 border rounded-lg">Download My Data</button>
          <button onclick="deactivateAccount()" class="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg">Deactivate Account</button>
        </div>
      </div>
    </div>
  `;
}

async function updateProfile(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const data = { name: formData.get('name'), email: formData.get('email'), phone: formData.get('phone') };
  showLoading();
  try {
    await api.user.updateProfile(data);
    const user = getCurrentUser(); user.name = data.name; user.email = data.email; user.phone = data.phone;
    localStorage.setItem('user', JSON.stringify(user));
    showToast('Profile updated', 'success');
    await showDashboardSection('profile');
  } catch(e) { showToast(e.message, 'error'); } finally { hideLoading(); }
}

async function uploadProfilePicture(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append('picture', file);
  showLoading();
  try {
    const response = await fetch('/api/user/profile-picture', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
      body: formData
    });
    const data = await response.json();
    if (data.success) {
      document.getElementById('profile-preview').src = data.data.profileImage;
      // Update local user object
      const user = getCurrentUser();
      user.profileImage = data.data.profileImage;
      localStorage.setItem('user', JSON.stringify(user));
      showToast('Profile picture updated', 'success');
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    showToast(error.message || 'Upload failed', 'error');
  } finally {
    hideLoading();
  }
}

function renderAdminCustomSubjects() {
    const curriculum = window.schoolSettings?.curriculum || 'cbc';
    const schoolLevel = window.schoolSettings?.schoolLevel || 'secondary';
    const curriculumInfo = (window.CURRICULUMS && window.CURRICULUMS[curriculum]) ? window.CURRICULUMS[curriculum] : { subjects: { secondary: [] } };
    const subjectInfo = curriculumInfo?.subjects[schoolLevel] || [];
    return `
        <div class="space-y-6 animate-fade-in">
            <div class="flex justify-between items-center"><h2 class="text-2xl font-bold">Custom Subjects</h2></div>
            <p class="text-sm text-muted-foreground">Add subjects that are not in the standard curriculum</p>
            <div class="rounded-xl border bg-card p-6">
                <div class="space-y-4">
                    <div class="flex gap-2"><input type="text" id="new-subject-name" placeholder="e.g., French, Computer Science, Art" class="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"><button onclick="addCustomSubject()" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">Add Subject</button></div>
                    <div><h4 class="text-sm font-medium mb-3">Curriculum Subjects</h4><div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">${subjectInfo.map(subject => `<div class="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"><span class="text-sm font-medium">${subject}</span><span class="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">core</span></div>`).join('')}</div></div>
                    <div><h4 class="text-sm font-medium mb-3">Custom Subjects</h4><div class="grid grid-cols-2 md:grid-cols-3 gap-3" id="custom-subjects-container">${customSubjects && customSubjects.length > 0 ? customSubjects.map(subject => `<div class="custom-subject-item flex items-center justify-between p-3 bg-secondary/30 rounded-lg border group" data-subject="${subject}"><span class="text-sm font-medium">${subject}</span><button onclick="removeCustomSubject('${subject}')" class="text-red-500 hover:text-red-700"><i data-lucide="x" class="h-4 w-4"></i></button></div>`).join('') : '<p class="text-sm text-muted-foreground col-span-3 py-4 text-center bg-muted/30 rounded-lg" id="no-custom-subjects-message">No custom subjects added yet</p>'}</div></div>
                </div>
            </div>
            <div class="flex justify-end"><button onclick="saveAllSettings()" class="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2"><i data-lucide="save" class="h-4 w-4"></i> Save Changes</button></div>
        </div>
    `;
}

// ============ CUSTOM SUBJECT ACTIONS ============
window.addCustomSubject = async function() {
    const newSubject = document.getElementById('new-subject-name')?.value.trim();
    if (!newSubject) { showToast('Please enter a subject name', 'error'); return; }
    const updatedSubjects = [...(customSubjects || []), newSubject];
    showLoading();
    try {
        const response = await api.admin.updateSchoolSettings({ customSubjects: updatedSubjects });
        if (response?.success) {
            customSubjects = updatedSubjects;
            window.customSubjects = updatedSubjects;
            window.schoolSettings = response.data;
            localStorage.setItem('schoolSettings', JSON.stringify(response.data));
            await showDashboardSection('custom-subjects');
            showToast(`Subject "${newSubject}" added`, 'success');
            await refreshClassManagementIfVisible();
        } else {
            throw new Error(response?.message || 'Save failed');
        }
    } catch (error) { showToast(error.message, 'error'); }
    finally { hideLoading(); }
};

window.removeCustomSubject = async function(subject) {
    if (!confirm(`Remove "${subject}" from custom subjects?`)) return;
    const updatedSubjects = (customSubjects || []).filter(s => s !== subject);
    showLoading();
    try {
        const response = await api.admin.updateSchoolSettings({ customSubjects: updatedSubjects });
        if (response?.success) {
            customSubjects = updatedSubjects;
            window.customSubjects = updatedSubjects;
            window.schoolSettings = response.data;
            localStorage.setItem('schoolSettings', JSON.stringify(response.data));
            await showDashboardSection('custom-subjects');
            showToast(`Subject "${subject}" removed`, 'info');
            await refreshClassManagementIfVisible();
        } else {
            throw new Error(response?.message || 'Save failed');
        }
    } catch (error) { showToast(error.message, 'error'); }
    finally { hideLoading(); }
};

window.saveAllSettings = async function() {
    const curriculum = document.getElementById('settings-curriculum')?.value;
    const schoolName = document.getElementById('settings-school-name')?.value;
    const schoolLevel = document.getElementById('settings-school-level')?.value;
    if (!schoolName) { showToast('School name is required', 'error'); return; }
    showLoading();
    try {
        const response = await api.admin.updateSchoolSettings({ curriculum, schoolName, schoolLevel, customSubjects: customSubjects || [] });
        if (response && response.success) {
            window.schoolSettings = response.data;
            window.customSubjects = response.data.settings?.customSubjects || [];
            localStorage.setItem('schoolSettings', JSON.stringify(response.data));
            
            // === ADD THIS BLOCK ===
            const freshSettings = await api.admin.getSchoolSettings();
            if (freshSettings && freshSettings.success) {
                window.schoolSettings = freshSettings.data;
                window.schoolSettings.curriculum = freshSettings.data.system;
                window.customSubjects = freshSettings.data.settings?.customSubjects || [];
                localStorage.setItem('schoolSettings', JSON.stringify(freshSettings.data));
            }
            // === END ADD ===
            
            const school = JSON.parse(localStorage.getItem('school') || '{}');
            school.name = schoolName;
            school.system = curriculum;
            school.settings = response.data.settings;
            localStorage.setItem('school', JSON.stringify(school));
            updateAllSchoolNameElements(schoolName);
            showToast('✅ Settings saved!', 'success');
            await updateAdminStats();
        } else {
            throw new Error(response?.message || 'Save failed');
        }
    } catch (error) {
        console.error('Save error:', error);
        showToast(error.message || 'Failed to save settings', 'error');
    } finally {
        hideLoading();
    }
};

// ============ HELP SECTION ============
function renderHelpSection() {
    const user = getCurrentUser();
    const role = user?.role || 'user';
    const helpArticles = {
        superadmin: [{ title: 'How to approve a new school', content: 'Go to School Approvals, review school details, click Approve. The school will be activated immediately.', keywords: ['approve', 'school', 'activate'] }],
        admin: [{ title: 'How to add a student', content: 'Go to Students, click Add Student, fill in details. The student receives an ELIMUID automatically.', keywords: ['add', 'student'] }, { title: 'How to approve a teacher', content: 'Go to Teacher Approvals, review teacher details, click Approve or Reject.', keywords: ['teacher', 'approve'] }, { title: 'How to generate duty roster', content: 'Go to Duty Management, select dates, click Generate Roster.', keywords: ['duty', 'roster'] }, { title: 'How to change curriculum', content: 'Go to Settings, select new curriculum, click Save.', keywords: ['curriculum', 'change'] }],
        teacher: [{ title: 'How to take attendance', content: 'Go to Attendance, mark each student as Present/Absent/Late, add notes, click Save Attendance.', keywords: ['attendance'] }, { title: 'How to enter grades', content: 'Go to Grades, select subject and assessment type, enter scores, click Save.', keywords: ['grade', 'marks'] }, { title: 'How to check in for duty', content: 'Go to Dashboard, find Duty Card, click Check In.', keywords: ['duty', 'checkin'] }],
        parent: [{ title: 'How to view child progress', content: 'Select your child from the top, view grades, attendance, and teacher comments.', keywords: ['progress', 'grades'] }, { title: 'How to report absence', content: 'Click Report Absence, select date, enter reason, submit.', keywords: ['absence', 'report'] }, { title: 'How to make payment', content: 'Go to Payments, select child, choose plan, enter amount, complete payment.', keywords: ['payment'] }],
        student: [{ title: 'How to view my grades', content: 'Go to My Grades to see all your scores and performance.', keywords: ['grade'] }, { title: 'How to use AI Tutor', content: 'Type your question in AI Tutor chat, get instant help.', keywords: ['ai', 'tutor'] }, { title: 'How to join study groups', content: 'Go to Study Chat to connect with other students.', keywords: ['study', 'chat'] }]
    };
    const articles = helpArticles[role] || helpArticles.admin;
    return `
        <div class="space-y-6 animate-fade-in max-w-5xl mx-auto">
            <div class="text-center"><h2 class="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Help Center</h2><p class="text-muted-foreground mt-2">Find answers to common questions and learn how to use the platform</p></div>
            <div class="relative"><i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"></i><input type="text" id="help-search" placeholder="Search help articles..." onkeyup="searchHelpArticles()" class="w-full pl-10 pr-4 py-3 rounded-xl border bg-card focus:ring-2 focus:ring-primary transition-all"></div>
            <div id="help-articles-container" class="grid gap-4">${articles.map(article => `<div class="help-article rounded-xl border bg-card p-6 hover:shadow-md transition-all cursor-pointer" data-title="${article.title.toLowerCase()}" data-content="${article.content.toLowerCase()}" data-keywords="${article.keywords.join(' ').toLowerCase()}" onclick="showHelpArticleDetail('${article.title.replace(/'/g, "\\'")}', '${article.content.replace(/'/g, "\\'")}')"><h3 class="font-semibold text-lg mb-2">📚 ${article.title}</h3><p class="text-muted-foreground">${article.content.substring(0, 150)}${article.content.length > 150 ? '...' : ''}</p></div>`).join('')}</div>
            <div class="rounded-xl border bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 p-6 text-center"><h3 class="font-semibold text-lg mb-2">💬 Still Need Help?</h3><p class="text-muted-foreground mb-4">Contact our support team for assistance</p><div class="flex gap-3 justify-center"><button onclick="showToast('Opening support chat...', 'info')" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"><i data-lucide="message-circle" class="h-4 w-4 inline mr-2"></i> Live Chat</button><button onclick="window.location.href='mailto:support@shuleai.com'" class="px-4 py-2 border rounded-lg hover:bg-accent"><i data-lucide="mail" class="h-4 w-4 inline mr-2"></i> Email Support</button></div></div>
        </div>
    `;
}

window.searchHelpArticles = function() {
    const searchTerm = document.getElementById('help-search')?.value.toLowerCase().trim();
    const articles = document.querySelectorAll('.help-article');
    if (!searchTerm) { articles.forEach(a => a.style.display = 'block'); return; }
    let found = 0;
    articles.forEach(article => {
        const title = article.dataset.title || '';
        const content = article.dataset.content || '';
        const keywords = article.dataset.keywords || '';
        const matches = title.includes(searchTerm) || content.includes(searchTerm) || keywords.includes(searchTerm);
        article.style.display = matches ? 'block' : 'none';
        if (matches) found++;
    });
    const container = document.getElementById('help-articles-container');
    let noResults = document.getElementById('no-results-message');
    if (found === 0 && searchTerm) {
        if (!noResults) {
            const msg = document.createElement('div');
            msg.id = 'no-results-message';
            msg.className = 'text-center py-12 col-span-full';
            msg.innerHTML = `<i data-lucide="search-x" class="h-12 w-12 mx-auto text-muted-foreground mb-3"></i><p class="text-muted-foreground">No results found for "${searchTerm}"</p><p class="text-sm text-muted-foreground mt-1">Try different keywords or contact support</p>`;
            container.appendChild(msg);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else if (noResults) { noResults.remove(); }
};

window.showHelpArticleDetail = function(title, content) {
    let modal = document.getElementById('help-article-modal');
    if (!modal) {
        const modalHTML = `<div id="help-article-modal" class="fixed inset-0 z-50 hidden"><div class="absolute inset-0 bg-black/50" onclick="closeHelpArticleModal()"></div><div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4"><div class="rounded-xl border bg-card p-6 shadow-xl animate-fade-in"><div class="modal-content"></div></div></div></div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('help-article-modal');
    }
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.innerHTML = `<div class="space-y-4"><div class="border-b pb-3"><h3 class="text-xl font-semibold">${title}</h3></div><div class="prose prose-sm max-w-none"><p class="text-muted-foreground">${content}</p></div><div class="flex justify-end gap-2 pt-4 border-t"><button onclick="closeHelpArticleModal()" class="px-4 py-2 border rounded-lg hover:bg-accent">Close</button><button onclick="window.location.href='mailto:support@shuleai.com'" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">Contact Support</button></div></div>`;
    }
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

function closeHelpArticleModal() { const m = document.getElementById('help-article-modal'); if(m) m.classList.add('hidden'); }

// At the end of admin-dashboard.js, add:

document.addEventListener('change', function(e) {
    if (e.target.id === 'announcement-recipients') {
        const val = e.target.value;
        document.getElementById('class-selector-container').classList.toggle('hidden', val !== 'specific_class');
        document.getElementById('parent-selector-container').classList.toggle('hidden', val !== 'individual_parent');
        if (val === 'specific_class') loadClassesForSelect();
        if (val === 'individual_parent') loadParentsForSelect();
    }
});

async function loadClassesForSelect() {
    try {
        const response = await api.admin.getClasses();
        const select = document.getElementById('announcement-class');
        select.innerHTML = '<option value="">Select a class</option>';
        response.data.forEach(cls => {
            select.innerHTML += `<option value="${cls.id}">${escapeHtml(cls.name)} (Grade ${escapeHtml(cls.grade)})</option>`;
        });
    } catch (error) {
        console.error('Failed to load classes:', error);
    }
}

async function loadParentsForSelect() {
    try {
        const response = await api.admin.getParents();
        const select = document.getElementById('announcement-parent');
        select.innerHTML = '<option value="">Select a parent</option>';
        response.data.forEach(parent => {
            const user = parent.User || {};
            select.innerHTML += `<option value="${user.id}">${escapeHtml(user.name)} (${escapeHtml(user.email)})</option>`;
        });
    } catch (error) {
        console.error('Failed to load parents:', error);
    }
}

async function sendAnnouncement() {
    const recipientType = document.getElementById('announcement-recipients').value;
    const title = document.getElementById('announcement-title').value.trim();
    const message = document.getElementById('announcement-message').value.trim();

    if (!title || !message) {
        showToast('Please enter a title and message', 'error');
        return;
    }

    showLoading();
    try {
        let userIds = [];
        if (recipientType === 'all_parents') {
            const parents = await api.admin.getParents();
            userIds = parents.data.map(p => p.userId);
        } else if (recipientType === 'specific_class') {
            const classId = document.getElementById('announcement-class').value;
            if (!classId) { showToast('Please select a class', 'error'); hideLoading(); return; }
            // Get students in class, then their parents
            const students = await api.admin.getClassStudents(classId);
            const parentIds = new Set();
            for (const student of students.data) {
                const parents = await api.parent.getChildren(); // This is not correct; need a better way.
                // For simplicity, assume we have a direct endpoint.
            }
            // Placeholder: you'd need a proper endpoint to get parents by class.
        } else {
            const parentId = document.getElementById('announcement-parent').value;
            if (!parentId) { showToast('Please select a parent', 'error'); hideLoading(); return; }
            userIds = [parentId];
        }

        // Send alerts to each user
        for (const userId of userIds) {
            await apiRequest('/api/alerts', {
                method: 'POST',
                body: JSON.stringify({ userId, role: 'parent', type: 'system', severity: 'info', title, message })
            });
        }

        showToast(`✅ Announcement sent to ${userIds.length} recipient(s)`, 'success');
        document.getElementById('announcement-title').value = '';
        document.getElementById('announcement-message').value = '';
    } catch (error) {
        showToast(error.message || 'Failed to send announcement', 'error');
    } finally {
        hideLoading();
    }
}


// ============ EXPORT FUNCTIONS ============
window.sendAnnouncement = sendAnnouncement;
window.renderAdminSection = renderAdminSection;
window.renderAdminDashboard = renderAdminDashboard;
window.renderAdminStudents = renderAdminStudents;
window.renderAdminTeachers = renderAdminTeachers;
window.renderAdminPendingTeachers = renderAdminPendingTeachers;
window.renderAdminDuty = renderAdminDuty;
window.renderAdminFairnessReport = renderAdminFairnessReport;
window.renderAdminTeacherWorkload = renderAdminTeacherWorkload;
window.renderAdminSettings = renderAdminSettings;
window.renderAdminCustomSubjects = renderAdminCustomSubjects;
window.addCustomSubject = addCustomSubject;
window.removeCustomSubject = removeCustomSubject;
window.saveAllSettings = saveAllSettings;
