import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCrashStore, EmergencyContact } from '../store/crashStore';

const { height } = Dimensions.get('window');

interface ContactModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (contact: Omit<EmergencyContact, 'id'>) => void;
  contact?: EmergencyContact | null;
}

const RELATIONSHIPS = ['family', 'friend', 'spouse', 'parent', 'sibling', 'other'];

export const ContactModal: React.FC<ContactModalProps> = ({ visible, onClose, onSave, contact }) => {
  const { t } = useTranslation();
  const { settings } = useCrashStore();
  const isDark = settings.theme === 'dark';
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('family');
  const [isPrimary, setIsPrimary] = useState(false);
  
  useEffect(() => {
    if (visible) {
      if (contact) {
        setName(contact.name);
        setPhone(contact.phone);
        setRelationship(contact.relationship);
        setIsPrimary(contact.is_primary);
      } else {
        setName('');
        setPhone('');
        setRelationship('family');
        setIsPrimary(false);
      }
    }
  }, [contact, visible]);
  
  const handleSave = () => {
    if (name.trim() && phone.trim()) {
      onSave({
        name: name.trim(),
        phone: phone.trim(),
        relationship,
        is_primary: isPrimary,
      });
      onClose();
    }
  };
  
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
                {contact ? t('edit') : t('addContact')}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>
            
            {/* Form Content */}
            <ScrollView 
              style={styles.formScrollView}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Name Input */}
              <View style={styles.fieldContainer}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
                  {t('name')}
                </Text>
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                  value={name}
                  onChangeText={setName}
                  placeholder={settings.language === 'es' ? 'Nombre completo' : 'Full name'}
                  placeholderTextColor="#888"
                  autoCapitalize="words"
                />
              </View>
              
              {/* Phone Input */}
              <View style={styles.fieldContainer}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
                  {t('phone')}
                </Text>
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+52 123 456 7890"
                  placeholderTextColor="#888"
                  keyboardType="phone-pad"
                />
              </View>
              
              {/* Relationship */}
              <View style={styles.fieldContainer}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
                  {t('relationship')}
                </Text>
                <View style={styles.relationshipContainer}>
                  {RELATIONSHIPS.map((rel) => (
                    <TouchableOpacity
                      key={rel}
                      style={[
                        styles.relationshipButton,
                        isDark ? styles.relationshipButtonDark : styles.relationshipButtonLight,
                        relationship === rel && styles.relationshipButtonActive,
                      ]}
                      onPress={() => setRelationship(rel)}
                    >
                      <Text
                        style={[
                          styles.relationshipText,
                          relationship === rel && styles.relationshipTextActive,
                        ]}
                      >
                        {t(rel)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Primary Contact Switch */}
              <View style={styles.switchRow}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight, { marginBottom: 0 }]}>
                  {t('primaryContact')}
                </Text>
                <Switch
                  value={isPrimary}
                  onValueChange={setIsPrimary}
                  trackColor={{ false: '#767577', true: '#00d9ff' }}
                  thumbColor={isPrimary ? '#fff' : '#f4f3f4'}
                />
              </View>
            </ScrollView>
            
            {/* Buttons */}
            <View style={styles.buttons}>
              <TouchableOpacity 
                style={[styles.cancelButton, isDark ? styles.cancelButtonDark : styles.cancelButtonLight]} 
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    minHeight: height * 0.55,
    maxHeight: height * 0.85,
  },
  containerDark: {
    backgroundColor: '#1a1a2e',
  },
  containerLight: {
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  closeIcon: {
    padding: 5,
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#000000',
  },
  formScrollView: {
    flex: 1,
  },
  formContent: {
    paddingBottom: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 52,
  },
  inputDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
  },
  inputLight: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    color: '#000',
  },
  relationshipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  relationshipButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  relationshipButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  relationshipButtonLight: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  relationshipButtonActive: {
    backgroundColor: 'rgba(0,217,255,0.2)',
    borderColor: '#00d9ff',
  },
  relationshipText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  relationshipTextActive: {
    color: '#00d9ff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 10,
  },
  buttons: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cancelButtonLight: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#00d9ff',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
