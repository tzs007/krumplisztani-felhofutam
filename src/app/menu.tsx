import { router } from "expo-router";

import { Button, ButtonText } from "@/components/ui/button";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { selectBestScore, useAppStore } from "@/store/useAppStore";

export default function MenuRoute() {
  const best = useAppStore(selectBestScore);

  return (
    <Center className="flex-1 bg-sky px-8">
      <VStack space="4xl" className="w-full max-w-sm items-stretch">
        <VStack space="sm" className="items-center">
          <Heading size="3xl" className="text-center text-sky-foreground">
            Hiperventi
          </Heading>
          <Heading size="xl" className="text-center text-sky-foreground">
            in Krumplisztán
          </Heading>
          {best > 0 && (
            <Text className="text-sky-foreground/80">Best: {best}</Text>
          )}
        </VStack>
        <VStack space="lg">
          <Button
            size="lg"
            variant="secondary"
            onPress={() => router.push("/game")}
          >
            <ButtonText>Start Game</ButtonText>
          </Button>
          <Button
            size="lg"
            variant="outline"
            onPress={() => router.push("/leaderboard")}
          >
            <ButtonText>Leaderboard</ButtonText>
          </Button>
        </VStack>
      </VStack>
    </Center>
  );
}
