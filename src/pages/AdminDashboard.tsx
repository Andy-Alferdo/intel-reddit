import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Users, Database, LogOut, Trash2, UserPlus, Edit, KeyRound, FileText, Check, Eye, EyeOff, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateShort } from '@/lib/dateUtils';
import { useAuditLog } from '@/hooks/useAuditLog';

interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
  role?: string;
}

interface AuditLog {
  id: string;
  user_id: string;
  action_type: string;
  resource_type: string;
  resource_id: string | null;
  details: any;
  created_at: string;
  user_email?: string;
}

interface RedditPost {
  id: string;
  post_id: string;
  case_id: string;
  author: string;
  subreddit: string;
  title: string;
  content: string;
  score: number;
  num_comments: number;
  created_utc: string;
  collected_at: string;
  sentiment?: string;
  case_number?: string;
  case_name?: string;
}

interface RedditComment {
  id: string;
  comment_id: string;
  case_id: string;
  author: string;
  subreddit: string;
  body: string;
  score: number;
  link_title: string;
  created_utc: string;
  collected_at: string;
  sentiment?: string;
  case_number?: string;
  case_name?: string;
}

const AdminDashboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [recentPosts, setRecentPosts] = useState<RedditPost[]>([]);
  const [recentComments, setRecentComments] = useState<RedditComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postsPage, setPostsPage] = useState(0);
  const [commentsPage, setCommentsPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editRoleOpen, setEditRoleOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState('user');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [createdUserCredentials, setCreatedUserCredentials] = useState<{ email: string; password: string } | null>(null);
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    console.log('AdminDashboard useEffect called');
    const initializeDashboard = async () => {
      console.log('Initializing dashboard...');
      const hasAccess = await checkAdminAccess();
      console.log('Admin access result:', hasAccess);
      if (hasAccess) {
        console.log('Fetching all data...');
        await Promise.all([
          fetchUsers(),
          fetchAuditLogs(),
          fetchRecentPosts(0, false),
          fetchRecentComments(0, false)
        ]);
        console.log('All data fetched');
      }
    };
    
    initializeDashboard();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate('/admin/login');
      return false;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      toast({
        title: "Access Denied",
        description: "You do not have admin privileges.",
        variant: "destructive",
      });
      navigate('/');
      return false;
    }

    return true;
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const usersWithRoles = await Promise.all(
        (profiles || []).map(async (profile: any) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.id)
            .maybeSingle();

          return {
            id: profile.id,
            email: profile.email || 'N/A',
            full_name: profile.full_name,
            created_at: profile.created_at,
            role: roleData ? String(roleData.role) : 'user',
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch users.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Get user emails for the logs
      const userIds = [...new Set(logs?.map(l => l.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      const emailMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

      setAuditLogs(
        (logs || []).map(log => ({
          ...log,
          user_email: emailMap.get(log.user_id) || 'Unknown',
        }))
      );
    } catch (error: any) {
      console.error('Failed to fetch audit logs:', error);
    }
  };

  const fetchRecentPosts = async (page = 0, append = false) => {
    console.log('fetchRecentPosts called with page:', page, 'append:', append);
    setPostsLoading(true);
    try {
      // First fetch posts without case join to see if they exist
      const { data: posts, error } = await supabase
        .from('reddit_posts')
        .select('*')
        .order('scraped_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      console.log('Posts data (without join):', posts, 'Error:', error);

      if (error) throw error;

      // Then fetch case information for each post
      const postsWithCaseInfo = await Promise.all(
        (posts || []).map(async (post) => {
          const { data: caseData } = await supabase
            .from('investigation_cases')
            .select('case_number, case_name')
            .eq('id', post.case_id)
            .maybeSingle();
          
          return {
            ...post,
            case_number: caseData?.case_number || 'Unknown',
            case_name: caseData?.case_name || 'Unknown Case',
          };
        })
      );

      if (append) {
        setRecentPosts(prev => [...prev, ...postsWithCaseInfo]);
      } else {
        setRecentPosts(postsWithCaseInfo);
      }

      setHasMorePosts((posts || []).length === ITEMS_PER_PAGE);
      console.log('Posts updated:', postsWithCaseInfo.length);
    } catch (error: any) {
      console.error('Failed to fetch recent posts:', error);
      toast({
        title: "Error",
        description: "Failed to fetch recent posts.",
        variant: "destructive",
      });
    } finally {
      setPostsLoading(false);
    }
  };

  const fetchRecentComments = async (page = 0, append = false) => {
    console.log('fetchRecentComments called with page:', page, 'append:', append);
    setCommentsLoading(true);
    try {
      // First fetch comments without case join to see if they exist
      const { data: comments, error } = await supabase
        .from('reddit_comments')
        .select('*')
        .order('scraped_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      console.log('Comments data (without join):', comments, 'Error:', error);

      if (error) throw error;

      // Then fetch case information for each comment
      const commentsWithCaseInfo = await Promise.all(
        (comments || []).map(async (comment) => {
          const { data: caseData } = await supabase
            .from('investigation_cases')
            .select('case_number, case_name')
            .eq('id', comment.case_id)
            .maybeSingle();
          
          return {
            ...comment,
            case_number: caseData?.case_number || 'Unknown',
            case_name: caseData?.case_name || 'Unknown Case',
          };
        })
      );

      if (append) {
        setRecentComments(prev => [...prev, ...commentsWithCaseInfo]);
      } else {
        setRecentComments(commentsWithCaseInfo);
      }

      setHasMoreComments((comments || []).length === ITEMS_PER_PAGE);
      console.log('Comments updated:', commentsWithCaseInfo.length);
    } catch (error: any) {
      console.error('Failed to fetch recent comments:', error);
      toast({
        title: "Error",
        description: "Failed to fetch recent comments.",
        variant: "destructive",
      });
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const loadMorePosts = () => {
    const nextPage = postsPage + 1;
    setPostsPage(nextPage);
    fetchRecentPosts(nextPage, true);
  };

  const loadMoreComments = () => {
    const nextPage = commentsPage + 1;
    setCommentsPage(nextPage);
    fetchRecentComments(nextPage, true);
  };

  const checkUsernameExists = async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameError('');
      return;
    }

    setIsCheckingUsername(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .maybeSingle();

      if (error) {
        console.error('Error checking username:', error);
        setUsernameError('');
      } else if (data) {
        setUsernameError('Username already exists');
      } else {
        setUsernameError('');
      }
    } catch (error) {
      console.error('Error checking username:', error);
      setUsernameError('');
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const checkEmailExists = async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailError('');
      return;
    }

    setIsCheckingEmail(true);
    try {
      const { data: { users }, error } = await supabase.auth.admin.listUsers();
      
      if (error) {
        console.error('Error checking email:', error);
        setEmailError('');
      } else {
        const emailExists = users?.some(u => u.email === email);
        if (emailExists) {
          setEmailError('Email already exists');
        } else {
          setEmailError('');
        }
      }
    } catch (error) {
      console.error('Error checking email:', error);
      setEmailError('');
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const username = e.target.value;
    setNewUsername(username);
    
    // Clear error if username is being deleted
    if (!username) {
      setUsernameError('');
      return;
    }
    
    // Debounce the check
    const timeoutId = setTimeout(() => {
      checkUsernameExists(username);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setNewUserEmail(email);
    
    // Clear error if email is being deleted
    if (!email) {
      setEmailError('');
      return;
    }
    
    // Debounce the check
    const timeoutId = setTimeout(() => {
      checkEmailExists(email);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  };

  const handleCreateUser = async () => {
    if (usernameError) {
      toast({
        title: "Validation Error",
        description: "Username already exists. Please choose a different one.",
        variant: "destructive",
      });
      return;
    }

    if (emailError) {
      toast({
        title: "Validation Error",
        description: "Email already exists. Please use a different email.",
        variant: "destructive",
      });
      return;
    }

    if (!newUsername || newUsername.length < 3 || newUsername.length > 20) {
      toast({
        title: "Validation Error",
        description: "Username must be 3-20 characters.",
        variant: "destructive",
      });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      toast({
        title: "Validation Error",
        description: "Username can only contain letters, numbers, and underscores.",
        variant: "destructive",
      });
      return;
    }

    if (!/^[a-zA-Z]/.test(newUsername)) {
      toast({
        title: "Validation Error",
        description: "Username must start with a letter.",
        variant: "destructive",
      });
      return;
    }

    if (!newUserPassword || newUserPassword.length < 8) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setCreatingUser(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { 
          email: newUserEmail, 
          password: newUserPassword,
          fullName: newUserFullName,
          username: newUsername,
          role: newUserRole 
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      // Store credentials for display
      setCreatedUserCredentials({ email: newUserEmail, password: newUserPassword });
      
      await logAction({
        actionType: 'user_create',
        resourceType: 'user',
        resourceId: data.user?.id,
        details: { email: newUserEmail, role: newUserRole },
      });

      setAddUserOpen(false);
      setShowCredentialsDialog(true);
      
      // Reset form
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUsername('');
      setNewUserRole('user');
      
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create user.",
        variant: "destructive",
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;

    try {
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', selectedUser.id);

      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: selectedUser.id, role: selectedRole as any });

      if (error) throw error;

      await logAction({
        actionType: 'role_change',
        resourceType: 'user',
        resourceId: selectedUser.id,
        details: { old_role: selectedUser.role, new_role: selectedRole },
      });

      toast({
        title: "Success",
        description: `Role updated to ${selectedRole} for ${selectedUser.email}.`,
      });

      setEditRoleOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update role.",
        variant: "destructive",
      });
    }
  };

  const openEditRole = (user: User) => {
    setSelectedUser(user);
    setSelectedRole(user.role || 'user');
    setEditRoleOpen(true);
  };

  const openResetPassword = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setResetPasswordOpen(true);
  };

  const handleAdminResetPassword = async () => {
    if (!selectedUser || !newPassword) {
      toast({
        title: "Validation Error",
        description: "Please enter a new password.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use edge function to reset password (requires service role)
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { userId: selectedUser.id, newPassword },
      });

      if (error) throw error;

      await logAction({
        actionType: 'password_reset',
        resourceType: 'user',
        resourceId: selectedUser.id,
        details: { admin_initiated: true },
      });

      toast({
        title: "Password Reset",
        description: `Password has been reset for ${selectedUser.email}.`,
      });

      setResetPasswordOpen(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    toast({
      title: "Info",
      description: "User deletion requires service role key. Please use the backend console.",
    });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'default';
      case 'moderator':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('delete') || action.includes('reset')) return 'destructive';
    if (action.includes('create') || action.includes('generate')) return 'default';
    return 'secondary';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Copied to clipboard.",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-forensic-dark to-forensic-darker p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Shield className="w-10 h-10 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
              <p className="text-muted-foreground">Manage users and security</p>
            </div>
          </div>
          <Button onClick={handleLogout} variant="outline">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="content">
              <MessageSquare className="w-4 h-4 mr-2" />
              Content
            </TabsTrigger>
            <TabsTrigger value="audit">
              <FileText className="w-4 h-4 mr-2" />
              Audit
            </TabsTrigger>
            <TabsTrigger value="database">
              <Database className="w-4 h-4 mr-2" />
              Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Add and manage users directly</CardDescription>
                  </div>
                  <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add User
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                        <DialogDescription>
                          Create a new user account with login credentials.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="full-name">Full Name</Label>
                          <Input
                            id="full-name"
                            type="text"
                            value={newUserFullName}
                            onChange={(e) => setNewUserFullName(e.target.value)}
                            placeholder="John Doe"
                          />
                        </div>
                        <div>
                          <Label htmlFor="username">Username <span className="text-red-500">*</span></Label>
                          <Input
                            id="username"
                            type="text"
                            value={newUsername}
                            onChange={handleUsernameChange}
                            placeholder="johndoe"
                            className={usernameError ? 'border-red-500' : ''}
                          />
                          <p className="text-xs text-muted-foreground mt-1">3-20 characters, letters/numbers/underscores, must start with letter</p>
                          {usernameError && (
                            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                              {usernameError}
                              {isCheckingUsername && <span className="animate-spin">⏳</span>}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                          <Input
                            id="email"
                            type="email"
                            value={newUserEmail}
                            onChange={handleEmailChange}
                            placeholder="investigator@example.com"
                            className={emailError ? 'border-red-500' : ''}
                          />
                          {emailError && (
                            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                              {emailError}
                              {isCheckingEmail && <span className="animate-spin">⏳</span>}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                          <div className="relative">
                            <Input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              value={newUserPassword}
                              onChange={(e) => setNewUserPassword(e.target.value)}
                              placeholder="Minimum 8 characters"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="role">Role</Label>
                          <Select value={newUserRole} onValueChange={setNewUserRole}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">Investigator</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateUser} disabled={creatingUser || !!usernameError || !!emailError}>
                          {creatingUser ? 'Creating...' : 'Create User'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No users found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.email}</TableCell>
                          <TableCell>{user.full_name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={getRoleBadgeVariant(user.role || 'user')}>
                              {user.role || 'user'}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateShort(user.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => openEditRole(user)} title="Edit Role">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openResetPassword(user)} title="Reset Password">
                                <KeyRound className="w-4 h-4 text-warning" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(user.id)} title="Delete User">
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content">
            <div className="space-y-6">
              {/* Recent Posts Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Reddit Posts</CardTitle>
                  <CardDescription>Latest posts collected from investigations</CardDescription>
                </CardHeader>
                <CardContent>
                  {postsLoading && recentPosts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">Loading posts...</div>
                  ) : recentPosts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No posts found.</div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Author</TableHead>
                            <TableHead>Subreddit</TableHead>
                            <TableHead>Case</TableHead>
                            <TableHead>Investigator</TableHead>
                            <TableHead>Stored By</TableHead>
                            <TableHead>Collected</TableHead>
                            <TableHead>Sentiment</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentPosts.map((post) => (
                            <TableRow key={post.id}>
                              <TableCell className="max-w-[300px]">
                                <div className="truncate font-medium" title={post.title}>
                                  {post.title}
                                </div>
                              </TableCell>
                              <TableCell>{post.author}</TableCell>
                              <TableCell>r/{post.subreddit}</TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{post.case_number}</div>
                                  <div className="text-sm text-muted-foreground truncate max-w-[150px]" title={post.case_name}>
                                    {post.case_name}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {post.investigator_username ? (
                                  <Badge variant="outline">{post.investigator_username}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {post.stored_by_function ? (
                                  <Badge variant="secondary">{post.stored_by_function}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>{formatDateShort(post.scraped_at)}</TableCell>
                              <TableCell>
                                {post.sentiment && (
                                  <Badge variant={
                                    post.sentiment === 'positive' ? 'default' :
                                    post.sentiment === 'negative' ? 'destructive' : 'secondary'
                                  }>
                                    {post.sentiment}
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {hasMorePosts && (
                        <div className="flex justify-center mt-4">
                          <Button 
                            onClick={loadMorePosts} 
                            disabled={postsLoading}
                            variant="outline"
                          >
                            {postsLoading ? 'Loading...' : 'Load More Posts'}
                            <ChevronRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Recent Comments Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Reddit Comments</CardTitle>
                  <CardDescription>Latest comments collected from investigations</CardDescription>
                </CardHeader>
                <CardContent>
                  {commentsLoading && recentComments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">Loading comments...</div>
                  ) : recentComments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No comments found.</div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Comment</TableHead>
                            <TableHead>Author</TableHead>
                            <TableHead>Subreddit</TableHead>
                            <TableHead>Case</TableHead>
                            <TableHead>Investigator</TableHead>
                            <TableHead>Stored By</TableHead>
                            <TableHead>Collected</TableHead>
                            <TableHead>Sentiment</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentComments.map((comment) => (
                            <TableRow key={comment.id}>
                              <TableCell className="max-w-[300px]">
                                <div className="truncate" title={comment.body}>
                                  {comment.body}
                                </div>
                              </TableCell>
                              <TableCell>{comment.author}</TableCell>
                              <TableCell>r/{comment.subreddit}</TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{comment.case_number}</div>
                                  <div className="text-sm text-muted-foreground truncate max-w-[150px]" title={comment.case_name}>
                                    {comment.case_name}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {comment.investigator_username ? (
                                  <Badge variant="outline">{comment.investigator_username}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {comment.stored_by_function ? (
                                  <Badge variant="secondary">{comment.stored_by_function}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>{formatDateShort(comment.scraped_at)}</TableCell>
                              <TableCell>
                                {comment.sentiment && (
                                  <Badge variant={
                                    comment.sentiment === 'positive' ? 'default' :
                                    comment.sentiment === 'negative' ? 'destructive' : 'secondary'
                                  }>
                                    {comment.sentiment}
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {hasMoreComments && (
                        <div className="flex justify-center mt-4">
                          <Button 
                            onClick={loadMoreComments} 
                            disabled={commentsLoading}
                            variant="outline"
                          >
                            {commentsLoading ? 'Loading...' : 'Load More Comments'}
                            <ChevronRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Audit Trail</CardTitle>
                <CardDescription>Recent activity log (last 100 entries)</CardDescription>
              </CardHeader>
              <CardContent>
                {auditLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No audit logs found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">{formatDateShort(log.created_at)}</TableCell>
                          <TableCell className="text-sm">{log.user_email}</TableCell>
                          <TableCell>
                            <Badge variant={getActionBadgeVariant(log.action_type)}>{log.action_type}</Badge>
                          </TableCell>
                          <TableCell>{log.resource_type}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {log.details ? JSON.stringify(log.details) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="database">
            <Card>
              <CardHeader>
                <CardTitle>System Statistics</CardTitle>
                <CardDescription>Overview of system usage and data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Total Users</h3>
                    <p className="text-3xl font-bold text-primary">{users.length}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Admins</h3>
                    <p className="text-3xl font-bold text-primary">
                      {users.filter(u => u.role === 'admin').length}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Total Posts</h3>
                    <p className="text-3xl font-bold text-primary">{recentPosts.length}</p>
                    <p className="text-sm text-muted-foreground">In database</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Total Comments</h3>
                    <p className="text-3xl font-bold text-primary">{recentComments.length}</p>
                    <p className="text-sm text-muted-foreground">In database</p>
                  </div>
                </div>
                
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Audit Log Entries</h3>
                    <p className="text-3xl font-bold text-primary">{auditLogs.length}</p>
                    <p className="text-sm text-muted-foreground">Recent activity</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Investigations</h3>
                    <p className="text-3xl font-bold text-primary">
                      {[...new Set([...recentPosts, ...recentComments].map(item => item.case_id))].length}
                    </p>
                    <p className="text-sm text-muted-foreground">Active cases</p>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="font-semibold mb-4">Sentiment Analysis Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                      <h3 className="font-semibold mb-2 text-green-700 dark:text-green-300">Positive</h3>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {[...recentPosts, ...recentComments].filter(item => item.sentiment === 'positive').length}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900/20">
                      <h3 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">Neutral</h3>
                      <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                        {[...recentPosts, ...recentComments].filter(item => item.sentiment === 'neutral').length}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg bg-red-50 dark:bg-red-900/20">
                      <h3 className="font-semibold mb-2 text-red-700 dark:text-red-300">Negative</h3>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {[...recentPosts, ...recentComments].filter(item => item.sentiment === 'negative').length}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Role Dialog */}
        <Dialog open={editRoleOpen} onOpenChange={setEditRoleOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User Role</DialogTitle>
              <DialogDescription>Change the role for {selectedUser?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-role">Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Investigator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRoleOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateRole}>Update Role</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>Set a new password for {selectedUser?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8 chars)"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
              <Button onClick={handleAdminResetPassword} variant="destructive">Reset Password</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* User Created Success Dialog */}
        <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                User Created Successfully
              </DialogTitle>
              <DialogDescription>
                Share these credentials with the user securely. They can use these to login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg border space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-medium flex-1">{createdUserCredentials?.email}</code>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => copyToClipboard(createdUserCredentials?.email || '')}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Password</Label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-medium flex-1">{createdUserCredentials?.password}</code>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => copyToClipboard(createdUserCredentials?.password || '')}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Share these credentials via WhatsApp, SMS, email, or any secure method.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                setShowCredentialsDialog(false);
                setCreatedUserCredentials(null);
              }}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminDashboard;
