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
const PHONE_PREFIXES = ['+52', '+1', '+57', '+34', '+54'];

export const ContactModal: React.FC<ContactModalProps> = ({ visible, onClose, onSave, contact }) => {
  const { t } = useTranslation();
  const { settings } = useCrashStore();
  const isDark = settings.theme === 'dark';

  const [name, setName] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+52');
  const [relationship, setRelationship] = useState('family');
  const [isPrimary, setIsPrimary] = useState(false);

  useEffect(() => {
    if (!visible) return;

    if (contact) {
      const cleaned = contact.phone.replace(/\s+/g, '');
      const detectedPrefix = PHONE_PREFIXES.find((prefix) => cleaned.startsWith(prefix)) || '+52';
      const strippedLocal = cleaned.replace(detectedPrefix, '').replace(/\D/g, '');

      setName(contact.name);
      setPhonePrefix(detectedPrefix);
      setLocalPhone(strippedLocal);
      setRelationship(contact.relationship);
      setIsPrimary(contact.is_primary);
    } else {
      setName('');
      setPhonePrefix('+52');
      setLocalPhone('');
      setRelationship('family');
      setIsPrimary(false);
    }
  }, [contact, visible]);

  const formatLocalPhone = (value: string) => value.replace(/\D/g, '').slice(0, 14);

  const handleSave = () => {
    if (!name.trim() || !localPhone.trim()) return;

    onSave({
      name: name.trim(),
      phone: `${phonePrefix}${localPhone}`,
      relationship,
      is_primary: isPrimary,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
            <View style={styles.header}>
              <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
                {contact ? t('edit') : t('addContact')}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formScrollView}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.fieldContainer}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('name')}</Text>
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                  value={name}
                  onChangeText={setName}
                  placeholder={settings.language === 'es' ? 'Nombre completo' : 'Full name'}
                  placeholderTextColor="#8892a0"
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('phone')}</Text>
                <View style={styles.prefixContainer}>
                  {PHONE_PREFIXES.map((prefix) => (
                    <TouchableOpacity
                      key={prefix}
                      style={[styles.prefixChip, phonePrefix === prefix && styles.prefixChipActive]}
                      onPress={() => setPhonePrefix(prefix)}
                    >
                      <Text style={phonePrefix === prefix ? styles.prefixTextActive : styles.prefixText}>
                        {prefix}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.phoneRow}>
                  <View style={styles.prefixIndicator}>
                    <Text style={styles.prefixIndicatorText}>{phonePrefix}</Text>
                  </View>
                  <TextInput
                    style={[styles.phoneInput, isDark ? styles.inputDark : styles.inputLight]}
                    value={localPhone}
                    onChangeText={(value) => setLocalPhone(formatLocalPhone(value))}
                    placeholder={settings.language === 'es' ? '5512345678' : '5512345678'}
                    placeholderTextColor="#8892a0"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('relationship')}</Text>
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
                      <Text style={[styles.relationshipText, relationship === rel && styles.relationshipTextActive]}>
                        {t(rel)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.switchCard}>
                <View>
                  <Text style={[styles.label, isDark ? styles.textDark : styles.textLight, { marginBottom: 2 }]}>
                    {t('primaryContact')}
                  </Text>
                  <Text style={styles.switchHint}>
                    {settings.language === 'es' ? 'Recibirá prioridad para llamada automática.' : 'Will be prioritized for automatic call.'}
                  </Text>
                </View>
                <Switch
                  value={isPrimary}
                  onValueChange={setIsPrimary}
                  trackColor={{ false: '#475569', true: '#06b6d4' }}
                  thumbColor="#fff"
                />
              </View>
            </ScrollView>

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
    backgroundColor: 'rgba(1, 8, 20, 0.72)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 22,
    minHeight: height * 0.6,
    maxHeight: height * 0.9,
  },
  containerDark: {
    backgroundColor: '#0b1220',
  },
  containerLight: {
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
  },
  closeIcon: {
    padding: 8,
  },
  textDark: {
    color: '#ffffff',
  },
  textLight: {
    color: '#0f172a',
  },
  formScrollView: {
    flex: 1,
  },
  formContent: {
    paddingBottom: 20,
  },
  fieldContainer: {
    marginBottom: 18,
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  input: {
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    minHeight: 54,
  },
  inputDark: {
    backgroundColor: '#1e293b',
    color: '#fff',
  },
  inputLight: {
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
  },
  prefixContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  prefixChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.25)',
  },
  prefixChipActive: {
    backgroundColor: 'rgba(34,211,238,0.3)',
    borderWidth: 1,
    borderColor: '#22d3ee',
  },
  prefixText: { color: '#94a3b8', fontWeight: '600' },
  prefixTextActive: { color: '#22d3ee', fontWeight: '700' },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  prefixIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0ea5e9',
    minWidth: 60,
    alignItems: 'center',
  },
  prefixIndicatorText: {
    color: '#001019',
    fontWeight: '700',
    fontSize: 15,
  },
  phoneInput: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
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
    backgroundColor: '#1e293b',
  },
  relationshipButtonLight: {
    backgroundColor: '#e2e8f0',
  },
  relationshipButtonActive: {
    backgroundColor: 'rgba(34,211,238,0.15)',
    borderColor: '#22d3ee',
  },
  relationshipText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  relationshipTextActive: {
    color: '#22d3ee',
  },
  switchCard: {
    marginTop: 8,
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(30,41,59,0.35)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchHint: {
    color: '#94a3b8',
    fontSize: 12,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonDark: {
    backgroundColor: '#334155',
  },
  cancelButtonLight: {
    backgroundColor: '#cbd5e1',
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#001018',
    fontWeight: '800',
    fontSize: 16,
  },
});
