import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCrashStore, EmergencyContact } from '../../src/store/crashStore';
import { contactsApi } from '../../src/services/api';
import { ContactModal } from '../../src/components/ContactModal';

export default function ContactsScreen() {
  const { t } = useTranslation();
  const { contacts, setContacts, settings } = useCrashStore();
  const isDark = settings.theme === 'dark';
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  useEffect(() => {
    loadContacts();
  }, []);
  
  const loadContacts = async () => {
    try {
      const response = await contactsApi.getAll();
      setContacts(response.data);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  }, []);
  
  const handleAddContact = () => {
    setEditingContact(null);
    setModalVisible(true);
  };
  
  const handleEditContact = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setModalVisible(true);
  };
  
  const handleSaveContact = async (contactData: Omit<EmergencyContact, 'id'>) => {
    try {
      if (editingContact) {
        await contactsApi.update(editingContact.id, contactData);
      } else {
        await contactsApi.create(contactData);
      }
      await loadContacts();
    } catch (error) {
      console.error('Error saving contact:', error);
      Alert.alert(
        settings.language === 'es' ? 'Error' : 'Error',
        settings.language === 'es' ? 'No se pudo guardar el contacto' : 'Could not save contact'
      );
    }
  };
  
  const handleDeleteContact = (contact: EmergencyContact) => {
    Alert.alert(
      t('delete'),
      settings.language === 'es'
        ? `¿Eliminar a ${contact.name}?`
        : `Delete ${contact.name}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await contactsApi.delete(contact.id);
              await loadContacts();
            } catch (error) {
              console.error('Error deleting contact:', error);
            }
          },
        },
      ]
    );
  };
  
  const renderContact = ({ item }: { item: EmergencyContact }) => (
    <TouchableOpacity
      style={[styles.contactCard, isDark ? styles.cardDark : styles.cardLight]}
      onPress={() => handleEditContact(item)}
    >
      <View style={styles.contactAvatar}>
        <Ionicons name="person" size={24} color="#00d9ff" />
        {item.is_primary && (
          <View style={styles.primaryBadge}>
            <Ionicons name="star" size={12} color="#ffd93d" />
          </View>
        )}
      </View>
      
      <View style={styles.contactInfo}>
        <Text style={[styles.contactName, isDark ? styles.textDark : styles.textLight]}>
          {item.name}
        </Text>
        <Text style={styles.contactPhone}>{item.phone}</Text>
        <Text style={styles.contactRelationship}>{t(item.relationship)}</Text>
      </View>
      
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteContact(item)}
      >
        <Ionicons name="trash-outline" size={20} color="#f44336" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
  
  return (
    <SafeAreaView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
          {t('emergencyContacts')}
        </Text>
        <TouchableOpacity style={styles.addButton} onPress={handleAddContact}>
          <Ionicons name="add" size={24} color="#000" />
        </TouchableOpacity>
      </View>
      
      {contacts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={60} color="#444" />
          <Text style={styles.emptyText}>{t('noContacts')}</Text>
          <TouchableOpacity style={styles.emptyAddButton} onPress={handleAddContact}>
            <Text style={styles.emptyAddButtonText}>{t('addContact')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={contacts}
          renderItem={renderContact}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d9ff" />
          }
        />
      )}
      
      <ContactModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSaveContact}
        contact={editingContact}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerDark: {
    backgroundColor: '#0c0c0c',
  },
  containerLight: {
    backgroundColor: '#f0f4f8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#000000',
  },
  addButton: {
    backgroundColor: '#00d9ff',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 20,
    paddingTop: 0,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
  },
  cardDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardLight: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  contactAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,217,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 2,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 15,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
  },
  contactPhone: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  contactRelationship: {
    fontSize: 12,
    color: '#00d9ff',
    marginTop: 2,
  },
  deleteButton: {
    padding: 10,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 15,
    marginBottom: 20,
  },
  emptyAddButton: {
    backgroundColor: '#00d9ff',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  emptyAddButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
