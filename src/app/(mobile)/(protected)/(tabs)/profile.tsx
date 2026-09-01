import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  ScrollView,
} from "react-native";

import { useAuth } from "@/src/providers/AuthProvider";
import { useQualityPreferencesStore } from "@/src/stores/qualityPreferencesStore";
import { getPlatformClass } from "@/src/utils/deviceInfo";
import { globalDefaultOptions } from "@/src/utils/qualityTiers";

export default function ProfilePage() {
  const { signOut, user } = useAuth();

  const globalDefault = useQualityPreferencesStore((s) => s.globalDefault);
  const setGlobalDefault = useQualityPreferencesStore(
    (s) => s.setGlobalDefault,
  );
  const cellularDataSaver = useQualityPreferencesStore(
    (s) => s.cellularDataSaver,
  );
  const setCellularDataSaver = useQualityPreferencesStore(
    (s) => s.setCellularDataSaver,
  );

  const qualityOptions = useMemo(
    () => globalDefaultOptions(getPlatformClass()),
    [],
  );

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => signOut(),
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Manage your account and settings</Text>

      {user && (
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
      )}

      {/* Playback quality preferences (delivery-tiers contract). A tier
          picked inside the player is remembered per title and overrides
          this default. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Playback quality</Text>
        {qualityOptions.map((option) => {
          const isSelected = option.id === globalDefault;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.optionRow, isSelected && styles.optionRowSelected]}
              onPress={() => setGlobalDefault(option.id)}
            >
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>
                  {option.description}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          );
        })}

        <View style={styles.toggleRow}>
          <View style={styles.optionText}>
            <Text style={styles.optionLabel}>Data saver on cellular</Text>
            <Text style={styles.optionDescription}>
              Avoid Original and high-bitrate streams automatically on
              cellular. Picking a quality in the player still works.
            </Text>
          </View>
          <Switch
            value={cellularDataSaver}
            onValueChange={setCellularDataSaver}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: "#141414",
    flex: 1,
  },
  container: {
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#8C8C8C",
    marginBottom: 32,
  },
  userInfo: {
    alignItems: "center",
    marginBottom: 32,
  },
  userName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: "#8C8C8C",
  },
  section: {
    alignSelf: "stretch",
    marginBottom: 32,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  optionRow: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionRowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  optionText: {
    flexShrink: 1,
    paddingRight: 12,
  },
  optionLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  optionDescription: {
    color: "#8C8C8C",
    fontSize: 13,
    marginTop: 2,
  },
  toggleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  logoutButton: {
    backgroundColor: "#E50914",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
